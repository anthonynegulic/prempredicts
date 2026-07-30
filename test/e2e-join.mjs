/**
 * End-to-end for the shared join link, PIN auth and the share card.
 * See test/README.md. Writes to the database — scratch databases only.
 */
import { chromium } from "playwright";
import postgres from "postgres";
import { readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const SHOTS = process.env.SHOT_DIR ?? ".";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

let fails = 0;
const check = (label, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  ${extra}` : ""}`);
};

/**
 * Fetches inside the page so the browser's own cookie jar is used. Playwright's
 * request context will not attach a Secure cookie over plain http, and `next
 * start` sets NODE_ENV=production, so the session cookie is Secure here even
 * though the test server is http.
 */
async function fetchInPage(page, path) {
  return page.evaluate(async (p) => {
    const r = await fetch(p, { cache: "no-store" });
    const buf = await r.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return {
      status: r.status,
      contentType: r.headers.get("content-type"),
      cacheControl: r.headers.get("cache-control"),
      body: btoa(bin),
    };
  }, path);
}

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);

// Fresh state: nobody has joined.
await sql`update seasons set lock_at = '2026-08-21T19:00:00Z' where id = 1`;
await sql`update entrants set pin_hash = null, claimed_at = null, pin_failures = 0, pin_locked_until = null`;

// The join and home pages hide entrants still named "Entrant N" (unrenamed
// seed placeholders) — that's the whole point, an admin who hasn't set up the
// roster yet shouldn't have placeholders showing as real people. Rename the two
// this test drives, exactly as an admin would, so they're visible to claim.
const seeded = await sql`select id from entrants order by id limit 2`;
await sql`update entrants set display_name = 'Alice' where id = ${seeded[0].id}`;
await sql`update entrants set display_name = 'Bob' where id = ${seeded[1].id}`;
const roster = await sql`select id, display_name from entrants order by display_name limit 2`;
const [alice, bob] = roster;

// ---------- 1. Claim a name and set a PIN ----------
const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
const a = await ctxA.newPage();
await a.goto(`${BASE}/join`, { waitUntil: "networkidle" });
check("join page is reachable with no credentials", a.url().endsWith("/join"));

await a.selectOption("#claim-name", String(alice.id));
await a.fill("#claim-pin", "0000");
await a.fill("#claim-pin2", "0000");
await a.click("#claim-submit");
await a.waitForTimeout(1200);
check("weak PIN refused", (await a.locator("text=less guessable").count()) > 0);

await a.fill("#claim-pin", "8471");
await a.fill("#claim-pin2", "8472");
await a.click("#claim-submit");
await a.waitForTimeout(1200);
check("mismatched PINs refused", (await a.locator("text=don't match").count()) > 0);

await a.fill("#claim-pin", "8471");
await a.fill("#claim-pin2", "8471");
await a.click("#claim-submit");
await a.waitForURL("**/picks", { timeout: 15000 });
check("claiming lands on the picks page", a.url().endsWith("/picks"));
check(
  "PIN is hashed, never stored raw",
  await sql`select pin_hash from entrants where id = ${alice.id}`.then(
    (r) => r[0].pin_hash?.startsWith("scrypt$") && !r[0].pin_hash.includes("8471")
  )
);

// ---------- 2. A second person cannot take a claimed name ----------
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
const b = await ctxB.newPage();
await b.goto(`${BASE}/join`, { waitUntil: "networkidle" });
const claimable = await b.locator("#claim-name option").allTextContents();
check(
  "a claimed name is no longer offered for claiming",
  !claimable.some((t) => t.startsWith(alice.display_name)),
  `options: ${claimable.length}`
);

// ---------- 3. Wrong PIN, lockout, then the right PIN ----------
await b.click("#tab-returning");
await b.selectOption("#signin-name", String(alice.id));
for (let i = 0; i < 4; i++) {
  await b.fill("#signin-pin", "1111");
  await b.click("#signin-submit");
  await b.waitForTimeout(700);
}
const warn = await b.locator(".fielderr").first().textContent();
check("wrong PIN counts down remaining tries", /\d+ (try|tries) left/.test(warn ?? ""), `got "${warn}"`);

await b.fill("#signin-pin", "1111");
await b.click("#signin-submit");
await b.waitForTimeout(900);
check("fifth wrong PIN locks out", (await b.locator("text=locked for 15 minutes").count()) > 0);

// Correct PIN is refused while locked out — the lockout is real, not cosmetic.
await b.fill("#signin-pin", "8471");
await b.click("#signin-submit");
await b.waitForTimeout(900);
check(
  "correct PIN still refused during lockout",
  (await b.locator("text=Too many wrong PINs").count()) > 0 && !b.url().endsWith("/picks")
);

await sql`update entrants set pin_locked_until = null, pin_failures = 0 where id = ${alice.id}`;
await b.fill("#signin-pin", "8471");
await b.click("#signin-submit");
await b.waitForURL("**/picks", { timeout: 15000 });
check("correct PIN signs in after lockout expires", b.url().endsWith("/picks"));

// ---------- 4. No session means no picks ----------
const ctxC = await browser.newContext();
const c = await ctxC.newPage();
const res = await c.goto(`${BASE}/picks`, { waitUntil: "domcontentloaded" });
check("/picks with no session redirects to /join", c.url().endsWith("/join"), `got ${c.url()}`);
const cardRes = await fetchInPage(c, "/api/share-card");
check("share card with no session is refused", cardRes.status === 401, `got ${cardRes.status}`);

// ---------- 5. Alice's picks are hers alone ----------
await a.goto(`${BASE}/picks`, { waitUntil: "networkidle" });
await a.selectOption("#f-league_winner-0", "Arsenal");
await a.fill("#f-player_of_season-0", "ALICE-ONLY-PLAYER");
await a.click('button:has-text("Save picks")');
await a.waitForTimeout(1500);
check(
  "save works over a session with no token in the URL",
  (await sql`
    select p.raw_value from picks p join questions q on q.id = p.question_id
    where p.entrant_id = ${alice.id} and q.key = 'player_of_season'
  `)[0]?.raw_value === "ALICE-ONLY-PLAYER"
);

// Bob signed in as Alice above, so use a clean context claiming Bob's name.
const ctxD = await browser.newContext({ viewport: { width: 390, height: 844 } });
const d = await ctxD.newPage();
await d.goto(`${BASE}/join`, { waitUntil: "networkidle" });
await d.selectOption("#claim-name", String(bob.id));
await d.fill("#claim-pin", "5926");
await d.fill("#claim-pin2", "5926");
await d.click("#claim-submit");
await d.waitForURL("**/picks", { timeout: 15000 });
const bobHtml = await d.content();
check("second entrant never sees the first's picks", !bobHtml.includes("ALICE-ONLY-PLAYER"));

// ---------- 6. Share card gating and rendering ----------
const partial = await fetchInPage(d, "/api/share-card");
check("share card refused before all ten are answered", partial.status === 409, `got ${partial.status}`);

// Fill Alice's ten completely.
const qs = await sql`select id, key, slot_count, input_type from questions order by sort_order`;
const values = {
  league_winner: ["Arsenal"],
  top_four: ["Arsenal", "Liverpool", "Manchester City", "Newcastle United"],
  positions_5_6_7: ["Chelsea", "Aston Villa", "Everton"],
  relegated_three: ["Coventry City", "Hull City", "Ipswich Town"],
  player_of_season: ["Bukayo Saka"],
  young_player_of_season: ["Myles Lewis-Skelly"],
  top_scorer: ["Hugo Ekitiké"],
  most_assists: ["Cole Palmer"],
  first_manager_sacked: ["Everton"],
  wildcard: ["Hull win at the Emirates"],
};
for (const q of qs) {
  const vals = values[q.key] ?? [];
  for (let i = 0; i < q.slot_count; i++) {
    const v = vals[i] ?? null;
    const club = q.input_type === "free_text" ? null : v;
    await sql`
      insert into picks (season_id, entrant_id, question_id, slot_index, raw_value, canonical_club)
      values (1, ${alice.id}, ${q.id}, ${i}, ${v}, ${club})
      on conflict (entrant_id, question_id, slot_index) do update
        set raw_value = excluded.raw_value, canonical_club = excluded.canonical_club
    `;
  }
}
await sql`update entrants set club_affiliation = 'Arsenal' where id = ${alice.id}`;

const card = await fetchInPage(a, "/api/share-card");
check("share card renders once complete", card.status === 200, `got ${card.status}`);
check("share card is a PNG", card.contentType?.includes("image/png"), card.contentType);
check("share card is not cacheable by a CDN", /no-store/.test(card.cacheControl ?? ""), card.cacheControl);

const png = Buffer.from(card.body, "base64");
// PNG magic bytes, then confirm the dimensions from the IHDR chunk.
const isPng = png[0] === 0x89 && png.toString("ascii", 1, 4) === "PNG";
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
check("PNG header is valid", isPng);
check("PNG is 1080x1350", width === 1080 && height === 1350, `${width}x${height}`);
writeFileSync(`${SHOTS}/share-card.png`, png);

// The share button should now be visible on the form.
await a.goto(`${BASE}/picks`, { waitUntil: "networkidle" });
check("share button appears when all ten are in", (await a.locator('button:has-text("Share my picks")').count()) > 0);
await a.screenshot({ path: `${SHOTS}/picks-with-share.png`, fullPage: false });

// ---------- 7. Admin reset releases the name and keeps the picks ----------
await sql`
  update entrants set pin_hash = null, claimed_at = null, pin_failures = 0,
    pin_locked_until = null where id = ${alice.id}
`;
const kept = await sql`
  select p.raw_value from picks p join questions q on q.id = p.question_id
  where p.entrant_id = ${alice.id} and q.key = 'player_of_season'
`;
check("resetting access keeps the picks", kept[0]?.raw_value === "Bukayo Saka", `got ${kept[0]?.raw_value}`);

const ctxE = await browser.newContext();
const e = await ctxE.newPage();
await e.goto(`${BASE}/join`, { waitUntil: "networkidle" });
const reclaimable = await e.locator("#claim-name option").allTextContents();
check(
  "reset name is claimable again",
  reclaimable.some((t) => t.startsWith(alice.display_name))
);

// ---------- 8. Post-lock: no saving, share card still works ----------
await sql`update entrants set pin_hash = ${(await sql`select pin_hash from entrants where id = ${bob.id}`)[0].pin_hash}, claimed_at = now() where id = ${alice.id}`;
await sql`update seasons set lock_at = '2026-07-01T19:00:00Z' where id = 1`;
await a.goto(`${BASE}/picks`, { waitUntil: "networkidle" });
check("no save button after lock", (await a.locator('button:has-text("Save picks")').count()) === 0);
check("share button still offered after lock", (await a.locator('button:has-text("Share my picks")').count()) > 0);
const lockedCard = await fetchInPage(a, "/api/share-card");
check("share card renders after lock", lockedCard.status === 200, `got ${lockedCard.status}`);
writeFileSync(`${SHOTS}/share-card-locked.png`, Buffer.from(lockedCard.body, "base64"));

await sql`update seasons set lock_at = '2026-08-21T19:00:00Z' where id = 1`;
await browser.close();
await sql.end();
console.log(fails === 0 ? "\nAll join + share checks passed.\n" : `\n${fails} FAILED\n`);
process.exit(fails ? 1 : 0);
