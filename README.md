# Predictions League — 2026/27

Ten picks each, locked before the first kickoff, revealed to everyone at once.
Five to eight mates, mobile-first, bragging rights only.

**Lock:** `2026-08-21 19:00 UTC` (20:00 BST, first kickoff · 05:00 AEST Saturday
22 August). Stored and compared in UTC everywhere; the countdown renders in the
viewer's own timezone.

---

## Running it

```bash
npm install
cp .env.example .env.local        # fill in the three values
npm run db:push                   # apply db/schema.sql (idempotent)
npm run db:seed                   # season, ten questions, 8 placeholder entrants
```

`db:seed` prints one magic link per entrant. Rename the placeholders in `/admin`,
then DM the links out.

```bash
npm run dev
npm test                          # scoring rules
```

Deploy: Next.js App Router on Vercel, Postgres on Neon or Supabase free tier.
The three environment variables in `.env.example` are all it needs.

---

## Routes

| Route | Who | Pattern |
|---|---|---|
| `/` | anyone with the URL | 01 Flat |
| `/rules` | anyone | 01 Flat |
| `/e/<magic_token>` | one entrant | 01 Flat |
| `/board` | anyone, **only after lock** | 02–05 by section |
| `/admin` | passphrase | 06 Pinstripe |
| `/admin/picks/<id>` | passphrase | 06 Pinstripe |
| `/admin/outcomes` | passphrase | 06 Pinstripe |
| `/admin/audit` | passphrase | 06 Pinstripe |

Nothing is indexed by search engines (`robots: noindex`).

---

## The lock, and why it holds

Before `lock_at`, an entrant sees only their own picks. This is enforced in the
data layer, not the UI:

- `getOwnPicks(entrantId)` is the only pick query reachable pre-lock, and the
  `entrant_id` comes from the magic token, never from a client parameter.
- `getBoard(season)` returns `null` until `lock_at` has passed. The guard sits
  inside the function, so no route can leak picks by forgetting to check, and
  other entrants' picks are never queried at all — there is no client-side
  filtering to defeat.
- `savePicks` re-checks the lock server-side. A form left open when the lock
  passes cannot save. There is a test for exactly this.

At `lock_at` everything reveals at once and the entry form becomes read-only.

## Auth

Per-person magic links, pre-created by the admin. No passwords, no email, no
OAuth. **Entrants never type their own name** — that is what stops Dave, dave
and Davo becoming three people. Regenerating a link kills the old one
immediately.

Admin is a separate passphrase (`ADMIN_PASSPHRASE`), held in an HMAC-signed
httpOnly cookie for 12 hours. It is distinct from every entrant link.

## Admin edits are always logged

Every admin edit to a pick writes a `pick_audit` row — previous value, new
value, reason, timestamp — and a reason is **required**, enforced server-side.
The edited pick then shows an "edited by admin" flag to the entrant and on the
board. The admin is also a player, so the audit trail is what makes the result
credible.

---

## Scoring

Weights live in `questions.points_config` (jsonb), not in code, so they can be
tuned before lock with a `UPDATE` and no redeploy. `src/lib/scoring.ts` reads
whatever is in the column, and the rules page, the maximum, and the board all
derive from the same values.

| Rule | Meaning |
|---|---|
| `exact` | one value, one answer |
| `ordered_partial` | exact position scores `exact`, right club wrong position scores `wrongPosition` |
| `ordered_exact` | position must match, no partial credit |
| `set` | order ignored, points per correct member, a duplicate can't score twice |
| `manual_award` | never automatic; admin grants it after the group vote |

**Free-text picks are never fuzzy-matched.** Comparison folds case, accents and
punctuation — so `ekitike` matches `Ekitiké` — but `Saka` still does not match
`Bukayo Saka`. Those are reconciled by hand in `/admin/outcomes`, which writes
`canonical_player_id`; when set, it takes precedence over the raw text.

### ⚠ The brief's stated maximum doesn't add up

§4 gives per-question weights and then states "Maximum: 51 points (56 with the
wildcard bonus)". The weights as listed actually total **55 (60 with the
wildcard)**:

```
5 (winner) + 12 (top four, 3×4) + 6 (5/6/7, 2×3) + 9 (relegation, 3×3)
+ 5 + 5 + 5 + 5 (four player awards) + 3 (first sacked) = 55
```

The per-question table is the load-bearing spec, so it is what got implemented,
and the maximum is **derived** from the weights rather than hardcoded — the site
currently shows 55/60 and will always show whatever the weights actually sum to.
If 51 was the intended target, change the weights in the DB and every displayed
total follows. Nothing needs a redeploy.

---

## Aesthetic

Built from `kit-graphics-v2-pattern-system.html` rather than reinterpreted:
same palette tokens, same pattern CSS, same component classes.

**Palette never varies.** Blue `#1633f5`, blue-dark `#0b1a8f`, acid `#d9ff35`,
bone `#f3f1e8`, ink `#0c0d12`, grey `#8b8e9c`. Display type Saira Condensed 900
uppercase, body Saira, all numerals tabular.

**Pattern is the only thing that varies between sections**, and the assignment is
permanent — the pattern *is* the navigation:

| # | Pattern | Section |
|---|---|---|
| 01 | Flat | hero, entry form, rules |
| 02 | Vertical stripes | standings |
| 03 | Bolt | top four (and 5th/6th/7th, same kind of pick) |
| 04 | Sash | who backed whom — top scorer, assists, awards |
| 05 | Halves | relegation, wildcards |
| 06 | Pinstripe | admin, footer |
| 07 | Hoops | **unused** — reserved for a future season archive |

Three rules held to: patterns live in banner strips only and never behind body
text or tables; assignment never shuffles; intensity tracks how public the page
is, which is why admin gets the quietest pattern.

The bolt is an inline SVG `<pattern>`, not a CSS gradient, so the chevron joints
stay crisp. Each instance gets a unique id so multiple bolts can't collide.

Responsive to 360px with no horizontal overflow, visible keyboard focus on
everything interactive, `prefers-reduced-motion` respected, 16px form inputs so
iOS doesn't zoom on focus.

### Two placements the brief didn't assign

5th/6th/7th and "first manager sacked" have no pattern of their own in the
brief's table. Rather than invent new pairings or spend the reserved hoops,
5th/6th/7th sits under the Bolt banner with the top four (same kind of pick,
exact positions) and first-manager-sacked sits in the Sash "who backed whom"
tally with the other named picks. Move them if you'd rather.

### Faces

Shipped with initials. The shirt-number block renders a square cut-out
automatically once `avatar_url` is set — drop a square image at
`public/faces/<slug>.jpg` and set the path in `/admin`. Squares, not circles:
circles fight the geometry.

---

## Data model

Season-scoped from day one, so next August is a new `seasons` row rather than a
migration. Beyond the brief's tables:

- `picks.edited_by_admin_at` — drives the visible "edited by admin" flag
- `pick_audit.entrant_id`, `question_key`, `slot_index` — denormalised so the
  audit trail survives a deleted pick and reads without four joins
- `wildcard_awards` — one row per entrant, holds the group-voted 5 points

`canonical_player_id` exists now and stays null until September, as specified.

---

## Phase 2, still to build

Live league-table mirror and real goal/assist counts. The "who backed whom"
tally already works off picks alone, so it has something to show from
matchweek one; wiring it to live standings is the remaining step. Assists are
unreliable on free API tiers — the admin paste screen is the safer route, and
for five mates entirely defensible.

## Non-goals, not built

Real accounts, email, comments, multi-league, public sharing, PWA/offline,
player-name autocomplete, automated fuzzy matching.
