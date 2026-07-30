/**
 * Applies db/schema.sql. Idempotent — every statement is `if not exists`,
 * so running it against an existing database is safe.
 *
 *   npm run db:push
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const sql = postgres(url, { max: 1 });
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
