/**
 * Loads .env.local (then .env) into process.env.
 *
 * Next's dev server does this automatically, but the db: scripts run through
 * tsx, which does not — so without this, `npm run db:push` cannot see
 * DATABASE_URL even though `npm run dev` can. Imported for its side effect at
 * the top of migrate.ts and seed.ts.
 *
 * Deliberately zero-dependency, and deliberately tolerant of files saved by a
 * GUI text editor: BOMs, CRLF line endings and quoted values all parse.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parse(contents: string, source: string): void {
  // TextEdit will silently save rich text if the file was ever in RTF mode.
  if (contents.startsWith("{\\rtf")) {
    throw new Error(
      `${source} is rich text, not plain text. Re-create it with a plain-text ` +
        `editor (\`nano ${source}\`), or in TextEdit use Format → Make Plain Text.`
    );
  }

  for (const rawLine of contents.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!key) continue;

    let value = line.slice(eq + 1).trim();
    // Strip one layer of matching quotes, if the editor or user added them.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // A real environment variable always wins over the file.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

let loaded: string[] = [];

for (const name of [".env.local", ".env"]) {
  const path = join(process.cwd(), name);
  if (!existsSync(path)) continue;
  parse(readFileSync(path, "utf8"), name);
  loaded.push(name);
}

/** Names of the env files that were found, for friendlier error messages. */
export const envFilesLoaded = loaded;

/** Throws a message that says what to do, not just what went wrong. */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (value) return value;

  const where =
    loaded.length > 0
      ? `It isn't set in ${loaded.join(" or ")}.`
      : `No .env.local file was found in ${process.cwd()}.`;

  throw new Error(
    `${key} is not set. ${where}\n` +
      `  Copy .env.example to .env.local and fill in all three values.\n` +
      `  Check the filename too — TextEdit likes to save .env.local.txt.`
  );
}
