import { isClub } from "./clubs";
import type { InputType } from "./questions";

export type FieldError = {
  questionKey: string;
  slotIndex: number;
  message: string;
};

export type ValidationResult = {
  errors: FieldError[];
  /** Contradictions worth pointing out but not worth blocking a save over. */
  warnings: string[];
};

/** A club occupies exactly one final-table position, so these can't overlap. */
const TABLE_POSITION_KEYS = ["top_four", "positions_5_6_7", "relegated_three"];

const SLOT_NAMES: Record<string, string[]> = {
  top_four: ["1st", "2nd", "3rd", "4th"],
  positions_5_6_7: ["5th", "6th", "7th"],
  relegated_three: ["one of your relegated three", "one of your relegated three", "one of your relegated three"],
};

function slotName(key: string, slot: number): string {
  return SLOT_NAMES[key]?.[slot] ?? `slot ${slot + 1}`;
}

export type PickInput = {
  questionKey: string;
  slotIndex: number;
  value: string;
};

export type QuestionShape = {
  key: string;
  inputType: InputType;
  slotCount: number;
  label: string;
};

/**
 * Validates a whole entry. Empty values are always fine — partial progress is
 * allowed and nothing is final until lock. What is not fine is a contradiction:
 * the same club in two final-table positions can never come true.
 *
 * Runs identically on the client (instant feedback) and the server
 * (authoritative). The client copy is a convenience, not the guard.
 */
export function validateEntry(
  questions: QuestionShape[],
  picks: PickInput[]
): ValidationResult {
  const errors: FieldError[] = [];
  const warnings: string[] = [];
  const byKey = new Map(questions.map((q) => [q.key, q]));

  const get = (key: string, slot: number) =>
    (picks.find((p) => p.questionKey === key && p.slotIndex === slot)?.value ?? "").trim();

  // Club dropdowns must contain a club from the list, not arbitrary text.
  for (const p of picks) {
    const q = byKey.get(p.questionKey);
    if (!q) continue;
    const v = p.value.trim();
    if (v === "") continue;
    if (q.inputType !== "free_text" && !isClub(v)) {
      errors.push({
        questionKey: p.questionKey,
        slotIndex: p.slotIndex,
        message: "Not a club in this season's league.",
      });
    }
    if (q.inputType === "free_text" && v.length > 120) {
      errors.push({
        questionKey: p.questionKey,
        slotIndex: p.slotIndex,
        message: "Keep it under 120 characters.",
      });
    }
  }

  // No club may hold two final-table positions.
  const seen = new Map<string, { key: string; slot: number }[]>();
  for (const key of TABLE_POSITION_KEYS) {
    const q = byKey.get(key);
    if (!q) continue;
    for (let i = 0; i < q.slotCount; i++) {
      const v = get(key, i);
      if (!v) continue;
      const list = seen.get(v) ?? [];
      list.push({ key, slot: i });
      seen.set(v, list);
    }
  }
  for (const [club, spots] of seen) {
    if (spots.length < 2) continue;
    for (const spot of spots) {
      const others = spots
        .filter((s) => s !== spot)
        .map((s) => slotName(s.key, s.slot))
        .join(" and ");
      errors.push({
        questionKey: spot.key,
        slotIndex: spot.slot,
        message: `${club} is also ${others}. Pick a different club.`,
      });
    }
  }

  // Winner and 1st place are the same claim. Worth flagging, not blocking —
  // it's your entry to get wrong if you insist.
  const winner = get("league_winner", 0);
  const first = get("top_four", 0);
  if (winner && first && winner !== first) {
    warnings.push(
      `You've got ${winner} winning the league but ${first} finishing 1st. Both are scored, so one of them is a wasted pick.`
    );
  }

  return { errors, warnings };
}

/** How many questions are fully answered, for the "7 of 10" indicator. */
export function countComplete(
  questions: QuestionShape[],
  picks: PickInput[]
): number {
  let n = 0;
  for (const q of questions) {
    const filled = picks.filter(
      (p) => p.questionKey === q.key && p.value.trim() !== ""
    ).length;
    if (filled >= q.slotCount) n++;
  }
  return n;
}
