/**
 * Admin pick-editing and audit trail, end to end. Route-independent for the
 * entrant side — picks are seeded directly, then edited through /admin — so this
 * stays valid regardless of how entrants authenticate. The entrant-facing flow
 * (join, PIN, save, share) is covered by test/e2e-join.mjs.
 *
 * Requires a built app running at BASE and playwright installed. Writes to the
 * database — scratch databases only. See test/README.md.
 */
import { chromium } from "playwright";
import postgres from "postgres";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let fails = 0;
const check = (label, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  ${extra}` : ""}`);
};

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

await sql`update seasons set lock_at = '2026-08-21T19:00:00Z' where id = 1`;
const [e1] = await sql`select id from entrants order by id limit 1`;
const [q] = await sql`select id from questions where key = 'player_of_season'`;

// Seed a known starting pick directly — no entrant route involved.
await sql`
  insert into picks (season_id, entrant_id, question_id, slot_index, raw_value)
  values (1, ${e1.id}, ${q.id}, 0, 'Declan Rice')
  on conflict (entrant_id, question_id, slot_index) do update
    set raw_value = excluded.raw_value, edited_by_admin_at = null
`;
await sql`delete from pick_audit where entrant_id = ${e1.id}`;

// ---------- Admin auth ----------
await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
await page.fill("#passphrase", "wrong-passphrase");
await page.click('button[type="submit"]');
await page.waitForTimeout(1200);
check("wrong passphrase rejected", (await page.locator("text=Wrong passphrase").count()) > 0);

await page.fill("#passphrase", process.env.ADMIN_PASSPHRASE);
await page.click('button[type="submit"]');
await page.waitForTimeout(1800);
check("correct passphrase admits", (await page.locator("text=Add an entrant").count()) > 0);

// ---------- Admin pick edit writes an audit row ----------
await page.goto(`${BASE}/admin/picks/${e1.id}`, { waitUntil: "networkidle" });
await page.fill(`#v-${q.id}-0`, "Bukayo Saka");
await page.fill(`#r-${q.id}-0`, "Corrected after DM");
await page
  .locator(`#r-${q.id}-0`)
  .locator("xpath=ancestor::form")
  .locator('button[type="submit"]')
  .click();
await page.waitForTimeout(1800);

const audit = await sql`
  select previous_value, new_value, reason from pick_audit
  where entrant_id = ${e1.id} order by changed_at desc limit 1
`;
check(
  "admin edit applied",
  (await sql`select raw_value from picks where entrant_id = ${e1.id} and question_id = ${q.id}`)[0]
    .raw_value === "Bukayo Saka"
);
check("audit row written", audit.length === 1);
check("audit records previous value", audit[0]?.previous_value === "Declan Rice", `got ${audit[0]?.previous_value}`);
check("audit records new value", audit[0]?.new_value === "Bukayo Saka", `got ${audit[0]?.new_value}`);
check("audit records reason", audit[0]?.reason === "Corrected after DM", `got ${audit[0]?.reason}`);
check(
  "pick flagged as admin-edited",
  (await sql`select edited_by_admin_at from picks where entrant_id = ${e1.id} and question_id = ${q.id}`)[0]
    .edited_by_admin_at !== null
);

// ---------- Edit with no reason is refused ----------
await page.goto(`${BASE}/admin/picks/${e1.id}`, { waitUntil: "networkidle" });
await page.fill(`#v-${q.id}-0`, "Cole Palmer");
await page
  .locator(`#v-${q.id}-0`)
  .locator("xpath=ancestor::form")
  .locator('button[type="submit"]')
  .click();
await page.waitForTimeout(1500);
check("edit without a reason refused", (await page.locator("text=A reason is required").count()) > 0);
check(
  "refused edit did not change the pick",
  (await sql`select raw_value from picks where entrant_id = ${e1.id} and question_id = ${q.id}`)[0]
    .raw_value === "Bukayo Saka"
);

// ---------- Audit trail page lists the edit ----------
await page.goto(`${BASE}/admin/audit`, { waitUntil: "networkidle" });
check("audit page shows the reason", (await page.locator("text=Corrected after DM").count()) > 0);

await browser.close();
await sql.end();
console.log(fails === 0 ? "\nAll admin + audit checks passed.\n" : `\n${fails} FAILED\n`);
process.exit(fails ? 1 : 0);
