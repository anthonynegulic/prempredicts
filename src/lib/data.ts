import { sql } from "./db";
import type { InputType, PointsConfig } from "./questions";
import { scoreEntrant, type EntrantScore } from "./scoring";

export type Season = {
  id: number;
  label: string;
  lock_at: Date;
  starts_on: Date | null;
  ends_on: Date | null;
  is_active: boolean;
};

export type Question = {
  id: number;
  key: string;
  label: string;
  help_text: string | null;
  input_type: InputType;
  slot_count: number;
  sort_order: number;
  points_config: PointsConfig;
};

export type Entrant = {
  id: number;
  season_id: number;
  display_name: string;
  slug: string;
  club_affiliation: string | null;
  avatar_url: string | null;
  claimed_at: Date | null;
  has_pin: boolean;
};

/**
 * True for a seeded slot the admin hasn't renamed yet — display_name still
 * matches db/seed.ts's `Entrant ${i}` template exactly. Used to keep unfilled
 * placeholder slots off every list a player sees (the home roster, the /join
 * claim list) while admin still shows every row so there's something to rename.
 */
const PLACEHOLDER_NAME = /^Entrant \d+$/;
export function isPlaceholderEntrant(displayName: string): boolean {
  return PLACEHOLDER_NAME.test(displayName.trim());
}

export type Pick = {
  id: number;
  question_id: number;
  slot_index: number;
  raw_value: string | null;
  canonical_club: string | null;
  canonical_player_id: string | null;
  edited_by_admin_at: Date | null;
};

export type Outcome = {
  question_id: number;
  slot_index: number;
  canonical_value: string | null;
  resolved_at: Date | null;
};

export async function getActiveSeason(): Promise<Season | null> {
  const rows = await sql<Season[]>`
    select id, label, lock_at, starts_on, ends_on, is_active
    from seasons where is_active limit 1
  `;
  return rows[0] ?? null;
}

/**
 * getActiveSeason, but reporting *why* there's no season. A missing season and
 * an unreachable database look the same to a page and need opposite fixes, so
 * the setup notice needs to tell them apart.
 */
export async function loadActiveSeason(): Promise<{
  season: Season | null;
  error: string | null;
}> {
  try {
    return { season: await getActiveSeason(), error: null };
  } catch (e) {
    return { season: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Single source of truth for the lock. Compared in UTC, always server-side. */
export function isLocked(season: Season, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(season.lock_at).getTime();
}

export async function getQuestions(seasonId: number): Promise<Question[]> {
  return sql<Question[]>`
    select id, key, label, help_text, input_type, slot_count, sort_order, points_config
    from questions where season_id = ${seasonId} order by sort_order
  `;
}

/** Roster only — never picks. Safe to render before lock. */
export async function getEntrants(seasonId: number): Promise<Entrant[]> {
  return sql<Entrant[]>`
    select id, season_id, display_name, slug, club_affiliation, avatar_url,
           claimed_at, (pin_hash is not null) as has_pin
    from entrants where season_id = ${seasonId} order by display_name, id
  `;
}

/**
 * The signed-in entrant. Identity comes from the session cookie, never from a
 * URL or a form field, so nothing an entrant can edit selects whose picks load.
 */
export async function getEntrantById(id: number): Promise<Entrant | null> {
  const rows = await sql<Entrant[]>`
    select id, season_id, display_name, slug, club_affiliation, avatar_url,
           claimed_at, (pin_hash is not null) as has_pin
    from entrants where id = ${id} limit 1
  `;
  return rows[0] ?? null;
}

/**
 * One entrant's own picks. The only pick query reachable before lock, and it is
 * always scoped by entrant_id from the magic token — never from a client param.
 */
export async function getOwnPicks(entrantId: number): Promise<Pick[]> {
  return sql<Pick[]>`
    select id, question_id, slot_index, raw_value, canonical_club,
           canonical_player_id, edited_by_admin_at
    from picks where entrant_id = ${entrantId}
    order by question_id, slot_index
  `;
}

export async function getOutcomes(seasonId: number): Promise<Outcome[]> {
  return sql<Outcome[]>`
    select question_id, slot_index, canonical_value, resolved_at
    from outcomes where season_id = ${seasonId}
  `;
}

/** How many of the ten questions this entrant has answered in full. */
export function countAnswered(questions: Question[], picks: Pick[]): number {
  let done = 0;
  for (const q of questions) {
    const filled = picks.filter(
      (p) => p.question_id === q.id && (p.raw_value ?? "").trim() !== ""
    ).length;
    if (filled >= q.slot_count) done++;
  }
  return done;
}

export type BoardEntrant = {
  entrant: Entrant;
  picks: Pick[];
  score: EntrantScore;
  rank: number;
};

export type Board = {
  season: Season;
  questions: Question[];
  entrants: BoardEntrant[];
  outcomes: Outcome[];
  anyResolved: boolean;
};

/**
 * The reveal board. Returns null until lock_at has passed — the guard lives
 * here, in the data layer, so no route can accidentally leak picks by
 * forgetting to check. Nothing about other entrants' picks is queried at all
 * before the lock, let alone sent to the client.
 */
export async function getBoard(season: Season): Promise<Board | null> {
  if (!isLocked(season)) return null;

  const [questions, entrants, outcomes, awards] = await Promise.all([
    getQuestions(season.id),
    getEntrants(season.id),
    getOutcomes(season.id),
    sql<{ entrant_id: number; points: number }[]>`
      select entrant_id, points from wildcard_awards where season_id = ${season.id}
    `,
  ]);

  const allPicks = await sql<(Pick & { entrant_id: number })[]>`
    select id, entrant_id, question_id, slot_index, raw_value, canonical_club,
           canonical_player_id, edited_by_admin_at
    from picks where season_id = ${season.id}
    order by question_id, slot_index
  `;

  const awardBy = new Map(awards.map((a) => [a.entrant_id, a.points]));

  const scored = entrants.map((entrant) => {
    const picks = allPicks.filter((p) => p.entrant_id === entrant.id);
    const score = scoreEntrant(
      entrant.id,
      questions,
      picks,
      outcomes,
      awardBy.get(entrant.id) ?? 0
    );
    return { entrant, picks, score };
  });

  // Highest total first. Ties share a rank and the next rank skips.
  scored.sort(
    (a, b) =>
      b.score.total - a.score.total ||
      a.entrant.display_name.localeCompare(b.entrant.display_name)
  );

  const ranked: BoardEntrant[] = [];
  scored.forEach((row, i) => {
    const prev = ranked[i - 1];
    const rank =
      prev && scored[i - 1].score.total === row.score.total ? prev.rank : i + 1;
    ranked.push({ ...row, rank });
  });

  return {
    season,
    questions,
    entrants: ranked,
    outcomes,
    anyResolved: outcomes.some((o) => (o.canonical_value ?? "") !== ""),
  };
}
