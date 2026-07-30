/** Numeric checks on the scoring engine. Run with tsx. */
import { scoreEntrant } from "../src/lib/scoring";
import { QUESTIONS, maxPoints } from "../src/lib/questions";

let fails = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
}

// Build question rows mirroring what the DB returns.
const Q = QUESTIONS.map((q, i) => ({
  id: i + 1,
  key: q.key,
  slot_count: q.slotCount,
  points_config: q.pointsConfig,
}));
const qid = (key: string) => Q.find((q) => q.key === key)!.id;

const pick = (key: string, slot: number, value: string) => ({
  question_id: qid(key),
  slot_index: slot,
  raw_value: value,
  canonical_club: null,
  canonical_player_id: null,
});
const outcome = (key: string, slot: number, value: string) => ({
  question_id: qid(key),
  slot_index: slot,
  canonical_value: value,
});

// ---- Stated maximum -------------------------------------------------------
const totals = maxPoints(QUESTIONS.map((q) => ({ pointsConfig: q.pointsConfig, slotCount: q.slotCount })));
console.log(`\nDerived maximum from the brief's weights: ${totals.base} base, ${totals.total} with wildcard\n`);

// ---- Top four: partial credit --------------------------------------------
// Actual top four: Arsenal, Liverpool, Man City, Newcastle United
const topFourOutcome = [
  outcome("top_four", 0, "Arsenal"),
  outcome("top_four", 1, "Liverpool"),
  outcome("top_four", 2, "Manchester City"),
  outcome("top_four", 3, "Newcastle United"),
];

// All four exact → 12
eq(
  "top four all exact = 12",
  scoreEntrant(1, Q, [
    pick("top_four", 0, "Arsenal"),
    pick("top_four", 1, "Liverpool"),
    pick("top_four", 2, "Manchester City"),
    pick("top_four", 3, "Newcastle United"),
  ], topFourOutcome).total,
  12
);

// Right four clubs, all in wrong positions → 4 x 1
eq(
  "top four right clubs all misplaced = 4",
  scoreEntrant(1, Q, [
    pick("top_four", 0, "Newcastle United"),
    pick("top_four", 1, "Manchester City"),
    pick("top_four", 2, "Liverpool"),
    pick("top_four", 3, "Arsenal"),
  ], topFourOutcome).total,
  4
);

// Two exact, one displaced, one absent → 3+3+1+0
eq(
  "top four 2 exact + 1 displaced = 7",
  scoreEntrant(1, Q, [
    pick("top_four", 0, "Arsenal"),
    pick("top_four", 1, "Liverpool"),
    pick("top_four", 2, "Newcastle United"),
    pick("top_four", 3, "Chelsea"),
  ], topFourOutcome).total,
  7
);

// Unresolved scores nothing and is not marked wrong.
const unresolved = scoreEntrant(1, Q, [pick("top_four", 0, "Arsenal")], []);
eq("unresolved top four = 0 pts", unresolved.total, 0);
eq("unresolved status", unresolved.byQuestion.get("top_four")!.slots[0].status, "unresolved");

// ---- 5/6/7: exact only, no partial credit -------------------------------
const p567 = [outcome("positions_5_6_7", 0, "Chelsea"), outcome("positions_5_6_7", 1, "Aston Villa"), outcome("positions_5_6_7", 2, "Everton")];
eq(
  "5/6/7 all exact = 6",
  scoreEntrant(1, Q, [
    pick("positions_5_6_7", 0, "Chelsea"),
    pick("positions_5_6_7", 1, "Aston Villa"),
    pick("positions_5_6_7", 2, "Everton"),
  ], p567).total,
  6
);
eq(
  "5/6/7 right clubs wrong order = 0 (no partial credit)",
  scoreEntrant(1, Q, [
    pick("positions_5_6_7", 0, "Everton"),
    pick("positions_5_6_7", 1, "Chelsea"),
    pick("positions_5_6_7", 2, "Aston Villa"),
  ], p567).total,
  0
);

// ---- Relegation: unordered set ------------------------------------------
const rel = [outcome("relegated_three", 0, "Coventry City"), outcome("relegated_three", 1, "Hull City"), outcome("relegated_three", 2, "Ipswich Town")];
eq(
  "relegation same set, different order = 9",
  scoreEntrant(1, Q, [
    pick("relegated_three", 0, "Ipswich Town"),
    pick("relegated_three", 1, "Coventry City"),
    pick("relegated_three", 2, "Hull City"),
  ], rel).total,
  9
);
eq(
  "relegation two of three = 6",
  scoreEntrant(1, Q, [
    pick("relegated_three", 0, "Hull City"),
    pick("relegated_three", 1, "Coventry City"),
    pick("relegated_three", 2, "Sunderland"),
  ], rel).total,
  6
);
// Duplicating a correct club must not score it twice.
eq(
  "relegation duplicate club scores once = 3",
  scoreEntrant(1, Q, [
    pick("relegated_three", 0, "Hull City"),
    pick("relegated_three", 1, "Hull City"),
    pick("relegated_three", 2, "Hull City"),
  ], rel).total,
  3
);

// ---- Free text normalisation, not fuzzy matching ------------------------
const ts = [outcome("top_scorer", 0, "Hugo Ekitiké")];
eq("free text accent+case insensitive = 5", scoreEntrant(1, Q, [pick("top_scorer", 0, "hugo ekitike")], ts).total, 5);
eq("free text surname only does NOT match = 0", scoreEntrant(1, Q, [pick("top_scorer", 0, "Ekitike")], ts).total, 0);

// canonical_player_id wins over raw text when set.
eq(
  "canonical mapping resolves a surname-only pick = 5",
  scoreEntrant(1, Q, [{ question_id: qid("top_scorer"), slot_index: 0, raw_value: "Saka", canonical_club: null, canonical_player_id: "Bukayo Saka" }],
    [outcome("top_scorer", 0, "Bukayo Saka")]).total,
  5
);

// ---- Wildcard: never automatic -----------------------------------------
eq("wildcard unawarded = 0", scoreEntrant(1, Q, [pick("wildcard", 0, "Hull win at the Emirates")], []).total, 0);
eq("wildcard awarded by vote = 5", scoreEntrant(1, Q, [pick("wildcard", 0, "Hull win at the Emirates")], [], 5).total, 5);

// ---- A full perfect entry ----------------------------------------------
const allOutcomes = [
  outcome("league_winner", 0, "Arsenal"),
  ...topFourOutcome,
  ...p567,
  ...rel,
  outcome("player_of_season", 0, "Bukayo Saka"),
  outcome("young_player_of_season", 0, "Myles Lewis-Skelly"),
  outcome("top_scorer", 0, "Erling Haaland"),
  outcome("most_assists", 0, "Cole Palmer"),
  outcome("first_manager_sacked", 0, "Everton"),
];
const perfect = [
  pick("league_winner", 0, "Arsenal"),
  pick("top_four", 0, "Arsenal"), pick("top_four", 1, "Liverpool"),
  pick("top_four", 2, "Manchester City"), pick("top_four", 3, "Newcastle United"),
  pick("positions_5_6_7", 0, "Chelsea"), pick("positions_5_6_7", 1, "Aston Villa"),
  pick("positions_5_6_7", 2, "Everton"),
  pick("relegated_three", 0, "Coventry City"), pick("relegated_three", 1, "Hull City"),
  pick("relegated_three", 2, "Ipswich Town"),
  pick("player_of_season", 0, "Bukayo Saka"),
  pick("young_player_of_season", 0, "Myles Lewis-Skelly"),
  pick("top_scorer", 0, "Erling Haaland"),
  pick("most_assists", 0, "Cole Palmer"),
  pick("first_manager_sacked", 0, "Everton"),
  pick("wildcard", 0, "Something daft"),
];
eq("perfect entry equals derived maximum", scoreEntrant(1, Q, perfect, allOutcomes).total, totals.base);
eq("perfect entry + wildcard vote", scoreEntrant(1, Q, perfect, allOutcomes, 5).total, totals.total);

// Empty entry scores nothing.
eq("empty entry = 0", scoreEntrant(1, Q, [], allOutcomes).total, 0);

console.log(fails === 0 ? "\nAll scoring checks passed.\n" : `\n${fails} FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
