/**
 * Seeds the 2026/27 season, the ten questions, and eight placeholder entrants.
 * Re-running updates question copy and scoring weights in place and leaves
 * entrants and picks alone.
 *
 *   npm run db:seed
 */
import postgres from "postgres";
import { requireEnv } from "./env";
import { QUESTIONS } from "../src/lib/questions";

const SEASON_LABEL = "2026-27";
// 20:00 BST, first kickoff. Stored and compared in UTC.
const LOCK_AT = "2026-08-21T19:00:00Z";
const ENTRANT_COUNT = 8;

async function main() {
  const url = requireEnv("DATABASE_URL");
  const sql = postgres(url, { max: 1 });

  try {
    const [season] = await sql<{ id: number }[]>`
      insert into seasons (label, lock_at, starts_on, ends_on, is_active)
      values (${SEASON_LABEL}, ${LOCK_AT}, '2026-08-21', '2027-05-23', true)
      on conflict (label) do update set lock_at = excluded.lock_at
      returning id
    `;
    console.log(`Season ${SEASON_LABEL} → id ${season.id}, locks ${LOCK_AT}`);

    for (const q of QUESTIONS) {
      await sql`
        insert into questions
          (season_id, key, label, help_text, input_type, slot_count, sort_order, points_config)
        values (
          ${season.id}, ${q.key}, ${q.label}, ${q.helpText}, ${q.inputType},
          ${q.slotCount}, ${q.sortOrder}, ${sql.json(q.pointsConfig)}
        )
        on conflict (season_id, key) do update set
          label         = excluded.label,
          help_text     = excluded.help_text,
          input_type    = excluded.input_type,
          slot_count    = excluded.slot_count,
          sort_order    = excluded.sort_order,
          points_config = excluded.points_config
      `;
    }
    console.log(`${QUESTIONS.length} questions seeded.`);

    const existing = await sql<{ n: string }[]>`
      select count(*) as n from entrants where season_id = ${season.id}
    `;
    if (Number(existing[0].n) > 0) {
      console.log(
        `${existing[0].n} entrants already exist — left untouched. Rename them in /admin.`
      );
    } else {
      for (let i = 1; i <= ENTRANT_COUNT; i++) {
        await sql`
          insert into entrants (season_id, display_name, slug)
          values (${season.id}, ${`Entrant ${i}`}, ${`entrant-${i}`})
        `;
      }
      console.log(`${ENTRANT_COUNT} placeholder entrants created.`);
    }

    const roster = await sql<{ display_name: string; claimed_at: Date | null }[]>`
      select display_name, claimed_at from entrants
      where season_id = ${season.id} order by display_name
    `;
    console.log("\nRoster — rename these in /admin before you share the link:\n");
    for (const r of roster) {
      const state = r.claimed_at ? "joined" : "not joined";
      console.log(`  ${r.display_name.padEnd(14)} ${state}`);
    }
    console.log(
      "\nOne link for everyone:  /join" +
        "\nEach person claims their own name there and sets a PIN.\n"
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
