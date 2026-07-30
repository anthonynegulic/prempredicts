import type { PointsConfig } from "./questions";

export type ScoredPick = {
  slotIndex: number;
  value: string | null;
  points: number;
  /** exact = right thing right place, partial = right club wrong position. */
  status: "exact" | "partial" | "wrong" | "unresolved";
};

export type QuestionScore = {
  questionId: number;
  key: string;
  points: number;
  maxPoints: number;
  resolved: boolean;
  slots: ScoredPick[];
};

export type EntrantScore = {
  entrantId: number;
  total: number;
  byQuestion: Map<string, QuestionScore>;
};

/**
 * Normalises a value for comparison. Trims, lowercases, folds accents and
 * collapses whitespace and punctuation.
 *
 * This is NOT fuzzy matching — "Saka" still does not equal "Bukayo Saka".
 * It only makes "Ekitiké" match "Ekitike" and " haaland " match "Haaland",
 * which is spelling hygiene, not guessing. Free-text picks are reconciled
 * properly by mapping canonical_player_id in admin.
 */
export function normalise(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type PickRow = {
  question_id: number;
  slot_index: number;
  raw_value: string | null;
  canonical_club: string | null;
  canonical_player_id: string | null;
};

type OutcomeRow = {
  question_id: number;
  slot_index: number;
  canonical_value: string | null;
};

type QuestionRow = {
  id: number;
  key: string;
  slot_count: number;
  points_config: PointsConfig;
};

/** The value a pick should be compared on: canonical mapping wins if present. */
function pickValue(p: PickRow): string | null {
  return p.canonical_player_id ?? p.canonical_club ?? p.raw_value;
}

/** Ceiling for one question, ignoring the wildcard vote. */
export function questionMax(config: PointsConfig, slotCount: number): number {
  switch (config.rule) {
    case "exact":
      return config.points;
    case "ordered_partial":
      return config.exact * slotCount;
    case "ordered_exact":
    case "set":
      return config.points * slotCount;
    case "manual_award":
      return 0;
  }
}

function scoreQuestion(
  q: QuestionRow,
  picks: PickRow[],
  outcomes: OutcomeRow[],
  wildcardAward: number
): QuestionScore {
  const config = q.points_config;
  const max = questionMax(config, q.slot_count);
  const bySlot = new Map(picks.map((p) => [p.slot_index, p]));
  const outcomeBySlot = new Map(outcomes.map((o) => [o.slot_index, o]));
  const resolved = outcomes.some((o) => (o.canonical_value ?? "") !== "");

  const slots: ScoredPick[] = [];
  let points = 0;

  if (config.rule === "manual_award") {
    // Never scored automatically. Points come from the group vote.
    const p = bySlot.get(0);
    return {
      questionId: q.id,
      key: q.key,
      points: wildcardAward,
      maxPoints: config.points,
      resolved: wildcardAward > 0,
      slots: [
        {
          slotIndex: 0,
          value: p ? pickValue(p) : null,
          points: wildcardAward,
          status: wildcardAward > 0 ? "exact" : "unresolved",
        },
      ],
    };
  }

  if (config.rule === "set") {
    // Order is not scored. Compare as sets, and never let a duplicated pick
    // claim the same outcome club twice.
    const outcomeSet = new Set(
      outcomes.map((o) => normalise(o.canonical_value)).filter(Boolean)
    );
    const claimed = new Set<string>();
    for (let i = 0; i < q.slot_count; i++) {
      const p = bySlot.get(i);
      const v = p ? pickValue(p) : null;
      const n = normalise(v);
      let status: ScoredPick["status"] = "wrong";
      let pts = 0;
      if (!resolved) {
        status = "unresolved";
      } else if (n && outcomeSet.has(n) && !claimed.has(n)) {
        claimed.add(n);
        status = "exact";
        pts = config.points;
      }
      points += pts;
      slots.push({ slotIndex: i, value: v, points: pts, status });
    }
    return { questionId: q.id, key: q.key, points, maxPoints: max, resolved, slots };
  }

  // Positional rules: exact, ordered_exact, ordered_partial.
  const allOutcomes = new Set(
    outcomes.map((o) => normalise(o.canonical_value)).filter(Boolean)
  );

  for (let i = 0; i < q.slot_count; i++) {
    const p = bySlot.get(i);
    const v = p ? pickValue(p) : null;
    const n = normalise(v);
    const target = normalise(outcomeBySlot.get(i)?.canonical_value);

    let status: ScoredPick["status"] = "wrong";
    let pts = 0;

    if (!resolved || !target) {
      status = "unresolved";
    } else if (n && n === target) {
      status = "exact";
      pts = config.rule === "ordered_partial" ? config.exact : config.points;
    } else if (config.rule === "ordered_partial" && n && allOutcomes.has(n)) {
      status = "partial";
      pts = config.wrongPosition;
    }

    points += pts;
    slots.push({ slotIndex: i, value: v, points: pts, status });
  }

  return { questionId: q.id, key: q.key, points, maxPoints: max, resolved, slots };
}

export function scoreEntrant(
  entrantId: number,
  questions: QuestionRow[],
  picks: PickRow[],
  outcomes: OutcomeRow[],
  wildcardAward = 0
): EntrantScore {
  const byQuestion = new Map<string, QuestionScore>();
  let total = 0;

  for (const q of questions) {
    const qPicks = picks.filter((p) => p.question_id === q.id);
    const qOutcomes = outcomes.filter((o) => o.question_id === q.id);
    const score = scoreQuestion(q, qPicks, qOutcomes, wildcardAward);
    byQuestion.set(q.key, score);
    total += score.points;
  }

  return { entrantId, total, byQuestion };
}
