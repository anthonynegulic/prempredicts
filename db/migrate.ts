/**
 * Applies db/schema.sql. Idempotent — every statement is `if not exists`,
 * so running it against an existing database is safe.
 *
 *   npm run db:push
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { requireEnv } from "./env";

async function main() {
  const url = requireEnv("DATABASE_URL");

  // Every statement is `if not exists`, so re-running emits a NOTICE per
  // existing table. They're expected and they look like errors — bin them.
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");

  try {
    await sql.unsafe(schema);
    console.log("Schema applied.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
