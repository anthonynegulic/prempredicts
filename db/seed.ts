/**
 * Seeds the 2026/27 season, the ten questions, and eight placeholder entrants
 * with magic links. Re-running updates question copy and scoring weights in
 * place and leaves entrants and picks alone.
 *
 *   npm run db:seed
 */
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { requireEnv } from "./env";
import { QUESTIONS } from "../src/lib/questions";

const SEASON_LABEL = "2026-27";
// 20:00 BST, first kickoff. Stored and compared in UTC.
const LOCK_AT = "2026-08-21T19:00:00Z";
const ENTRANT_COUNT = 8;

function token() {
  return randomBytes(16).toString("base64url");
}

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
          insert into entrants (season_id, display_name, slug, magic_token)
          values (${season.id}, ${`Entrant ${i}`}, ${`entrant-${i}`}, ${token()})
        `;
      }
      console.log(`${ENTRANT_COUNT} placeholder entrants created.`);
    }

    const links = await sql<{ display_name: string; magic_token: string }[]>`
      select display_name, magic_token from entrants
      where season_id = ${season.id} order by id
    `;
    console.log("\nMagic links — rename in /admin, then DM these out:\n");
    for (const l of links) {
      console.log(`  ${l.display_name.padEnd(12)} /e/${l.magic_token}`);
    }
    console.log("");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
