import { chromium } from "playwright";
import postgres from "postgres";

// Requires a built app already running at BASE, and playwright installed.
// See test/README.md.
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

const [e1] = await sql`select id, magic_token from entrants where id = 1`;

// ---------- 1. Save round-trip through the server action ----------
await sql`update seasons set lock_at = '2026-08-21T19:00:00Z' where id = 1`;
await page.goto(`${BASE}/e/${e1.magic_token}`, { waitUntil: "networkidle" });
await page.fill("#f-player_of_season-0", "Declan Rice");
await page.selectOption("#f-first_manager_sacked-0", "Fulham");
await page.click('button[type="submit"]');
await page.waitForTimeout(1500);

const saved = await sql`
  select q.key, p.raw_value, p.canonical_club from picks p
  join questions q on q.id = p.question_id
  where p.entrant_id = ${e1.id} and q.key in ('player_of_season','first_manager_sacked')
`;
const pos = saved.find((r) => r.key === "player_of_season");
const fms = saved.find((r) => r.key === "first_manager_sacked");
check("save persists free text", pos?.raw_value === "Declan Rice", `got ${pos?.raw_value}`);
check("save persists club", fms?.raw_value === "Fulham", `got ${fms?.raw_value}`);
check("club question sets canonical_club", fms?.canonical_club === "Fulham", `got ${fms?.canonical_club}`);
check("free text leaves canonical_club null", pos?.canonical_club === null, `got ${pos?.canonical_club}`);

const state = await page.locator(".savestate").first().textContent();
check("UI confirms the save", /Saved/.test(state ?? ""), `got "${state}"`);

// ---------- 2. Server refuses a save after lock ----------
// The client still has an open form; move the lock into the past behind its
// back, then submit. Only the server-side guard can catch this.
await page.fill("#f-player_of_season-0", "SHOULD-NOT-PERSIST");
await sql`update seasons set lock_at = '2026-07-01T19:00:00Z' where id = 1`;
await page.click('button[type="submit"]');
await page.waitForTimeout(1500);

const after = await sql`
  select p.raw_value from picks p join questions q on q.id = p.question_id
  where p.entrant_id = ${e1.id} and q.key = 'player_of_season'
`;
check("post-lock save rejected server-side", after[0].raw_value === "Declan Rice", `got ${after[0].raw_value}`);
const lockedMsg = await page.locator(".savestate").first().textContent();
check("locked message shown", /locked/i.test(lockedMsg ?? ""), `got "${lockedMsg}"`);

// ---------- 3. Entry page is read-only once locked ----------
await page.goto(`${BASE}/e/${e1.magic_token}`, { waitUntil: "networkidle" });
check("no save button after lock", (await page.locator('button:has-text("Save picks")').count()) === 0);

// ---------- 4. Admin auth ----------
await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
await page.fill("#passphrase", "wrong-passphrase");
await page.click('button[type="submit"]');
await page.waitForTimeout(1200);
check("wrong passphrase rejected", (await page.locator("text=Wrong passphrase").count()) > 0);

await page.fill("#passphrase", process.env.ADMIN_PASSPHRASE);
await page.click('button[type="submit"]');
await page.waitForTimeout(1800);
check("correct passphrase admits", (await page.locator('text=Add an entrant').count()) > 0);

// ---------- 5. Admin pick edit writes an audit row ----------
const [q] = await sql`select id from questions where key = 'player_of_season'`;
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
  select previous_value, new_value, reason, changed_by from pick_audit
  where entrant_id = ${e1.id} order by changed_at desc limit 1
`;
check("admin edit applied", (await sql`
  select raw_value from picks where entrant_id = ${e1.id} and question_id = ${q.id}
`)[0].raw_value === "Bukayo Saka");
check("audit row written", audit.length === 1);
check("audit records previous value", audit[0]?.previous_value === "Declan Rice", `got ${audit[0]?.previous_value}`);
check("audit records new value", audit[0]?.new_value === "Bukayo Saka", `got ${audit[0]?.new_value}`);
check("audit records reason", audit[0]?.reason === "Corrected after DM", `got ${audit[0]?.reason}`);

const flagged = await sql`
  select edited_by_admin_at from picks where entrant_id = ${e1.id} and question_id = ${q.id}
`;
check("pick flagged as admin-edited", flagged[0].edited_by_admin_at !== null);

// ---------- 6. Edit with no reason is refused ----------
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

// ---------- 7. Admin-edited flag is visible to the entrant ----------
await ctx.clearCookies();
await page.goto(`${BASE}/e/${e1.magic_token}`, { waitUntil: "networkidle" });
check("entrant sees the admin-edit flag", (await page.locator("text=Admin edit").count()) > 0);

// ---------- 8. Regenerating a link kills the old one ----------
const oldToken = e1.magic_token;
await sql`update entrants set magic_token = 'freshly-rotated-token' where id = ${e1.id}`;
const res = await page.goto(`${BASE}/e/${oldToken}`, { waitUntil: "domcontentloaded" });
check("old link 404s after rotation", res.status() === 404, `got ${res.status()}`);
await sql`update entrants set magic_token = ${oldToken} where id = ${e1.id}`;

await browser.close();
await sql.end();
console.log(fails === 0 ? "\nAll end-to-end checks passed.\n" : `\n${fails} FAILED\n`);
process.exit(fails ? 1 : 0);
