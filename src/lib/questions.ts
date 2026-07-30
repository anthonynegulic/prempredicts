export type InputType = "club" | "club_ordered" | "club_set" | "free_text";

/**
 * Scoring is data, not code. Every rule below can be tuned in the DB before
 * lock without a redeploy — the engine in scoring.ts reads these shapes.
 */
export type PointsConfig =
  /** One value, one answer. */
  | { rule: "exact"; points: number }
  /** Ordered slots with partial credit for right club, wrong position. */
  | { rule: "ordered_partial"; exact: number; wrongPosition: number }
  /** Ordered slots, exact position only. */
  | { rule: "ordered_exact"; points: number }
  /** Unordered set — order is not scored. */
  | { rule: "set"; points: number }
  /** Never scored automatically; admin awards after a group vote. */
  | { rule: "manual_award"; points: number };

export type QuestionSeed = {
  key: string;
  label: string;
  helpText: string;
  inputType: InputType;
  slotCount: number;
  sortOrder: number;
  pointsConfig: PointsConfig;
  /** Labels for each slot, shown in the form and on the board. */
  slotLabels?: string[];
};

/**
 * The ten questions. Help text carries the definitions — every ambiguity is
 * resolved here, in the copy, so there is nothing to argue about in May.
 */
export const QUESTIONS: QuestionSeed[] = [
  {
    key: "league_winner",
    label: "League winner",
    helpText: "Premier League champion 2026/27.",
    inputType: "club",
    slotCount: 1,
    sortOrder: 1,
    pointsConfig: { rule: "exact", points: 5 },
  },
  {
    key: "top_four",
    label: "Top four, in order",
    helpText:
      "Positions 1 to 4 on the final table. Four different clubs. Right club in the exact position scores 3; right club in the wrong position scores 1.",
    inputType: "club_ordered",
    slotCount: 4,
    sortOrder: 2,
    pointsConfig: { rule: "ordered_partial", exact: 3, wrongPosition: 1 },
    slotLabels: ["1st", "2nd", "3rd", "4th"],
  },
  {
    key: "positions_5_6_7",
    label: "5th, 6th and 7th",
    helpText:
      "Exact positions only — no partial credit here. Three different clubs, and they cannot repeat your top four.",
    inputType: "club_ordered",
    slotCount: 3,
    sortOrder: 3,
    pointsConfig: { rule: "ordered_exact", points: 2 },
    slotLabels: ["5th", "6th", "7th"],
  },
  {
    key: "relegated_three",
    label: "Relegated three",
    helpText:
      "The three clubs finishing 18th, 19th and 20th. Order is not scored — pick the set, 3 points per correct club.",
    inputType: "club_set",
    slotCount: 3,
    sortOrder: 4,
    pointsConfig: { rule: "set", points: 3 },
    slotLabels: ["Down", "Down", "Down"],
  },
  {
    key: "player_of_season",
    label: "Player of the Season",
    helpText: "The official Premier League award, not a pundit's XI.",
    inputType: "free_text",
    slotCount: 1,
    sortOrder: 5,
    pointsConfig: { rule: "exact", points: 5 },
  },
  {
    key: "young_player_of_season",
    label: "Young Player of the Season",
    helpText:
      "Must be under 21 as of 21 August 2026 — born on or after 22 August 2005. Age at entry, not at season end.",
    inputType: "free_text",
    slotCount: 1,
    sortOrder: 6,
    pointsConfig: { rule: "exact", points: 5 },
  },
  {
    key: "top_scorer",
    label: "Top scorer",
    helpText:
      "Premier League goals only. Cups and Europe do not count. Shared Golden Boot counts for everyone who ties.",
    inputType: "free_text",
    slotCount: 1,
    sortOrder: 7,
    pointsConfig: { rule: "exact", points: 5 },
  },
  {
    key: "most_assists",
    label: "Most assists",
    helpText:
      "Premier League assists only, per the official Premier League count. Ties count for everyone.",
    inputType: "free_text",
    slotCount: 1,
    sortOrder: 8,
    pointsConfig: { rule: "exact", points: 5 },
  },
  {
    key: "first_manager_sacked",
    label: "First manager sacked",
    helpText:
      "Pick the club, not the person. First permanent Premier League manager to leave by sacking or mutual consent after the season starts. Resignations for another job do not count.",
    inputType: "club",
    slotCount: 1,
    sortOrder: 9,
    pointsConfig: { rule: "exact", points: 3 },
  },
  {
    key: "wildcard",
    label: "Wildcard",
    helpText:
      "One line. Anything you like. Not scored automatically — worth 5 points if the group votes it good at season end.",
    inputType: "free_text",
    slotCount: 1,
    sortOrder: 10,
    pointsConfig: { rule: "manual_award", points: 5 },
  },
];

/** Points available if everything lands, excluding the wildcard vote. */
export function maxPoints(qs: { pointsConfig: PointsConfig; slotCount: number }[]) {
  let base = 0;
  let bonus = 0;
  for (const q of qs) {
    const c = q.pointsConfig;
    switch (c.rule) {
      case "exact":
        base += c.points;
        break;
      case "ordered_partial":
        base += c.exact * q.slotCount;
        break;
      case "ordered_exact":
        base += c.points * q.slotCount;
        break;
      case "set":
        base += c.points * q.slotCount;
        break;
      case "manual_award":
        bonus += c.points;
        break;
    }
  }
  return { base, bonus, total: base + bonus };
}

/** Human-readable scoring line for a question, shown before entry. */
export function scoringLine(c: PointsConfig, slotCount: number): string {
  switch (c.rule) {
    case "exact":
      return `${c.points} pts`;
    case "ordered_partial":
      return `${c.exact} pts exact position · ${c.wrongPosition} pt right club, wrong position`;
    case "ordered_exact":
      return `${c.points} pts each, exact position only`;
    case "set":
      return `${c.points} pts per correct club, order ignored`;
    case "manual_award":
      return `0 pts, or ${c.points} by group vote`;
  }
  return `${slotCount} slots`;
}
