# Tests

## Scoring rules — `npm test`

Pure functions, no database, no server. Checks the numbers the whole
competition depends on: partial credit on the top four, exact-only on 5th/6th/7th,
the relegation set ignoring order, a duplicated club not scoring twice, accent
and case folding on free text, a surname-only pick *not* matching, canonical
player mapping taking precedence, and the wildcard never scoring automatically.

Run this after changing any weight in `src/lib/questions.ts`.

## End to end — `node test/e2e.mjs`

Drives a real browser against a running build. Covers the things that would
ruin the competition if they broke:

- picks save and persist, with `canonical_club` set only for club questions
- **a save is refused server-side after the lock**, even from a form that was
  already open when the lock passed
- the entry page goes read-only after lock
- wrong admin passphrase is rejected, correct one admits
- an admin pick edit writes a `pick_audit` row with previous value, new value
  and reason, and flags the pick
- an admin edit with no reason is refused and changes nothing
- the entrant sees the "edited by admin" flag
- regenerating a magic link 404s the old one

It writes to the database it points at, so **only run it against a scratch
database**, never the real one.

```bash
npm install --no-save playwright        # not a project dependency
npm run build
DATABASE_URL=... ADMIN_PASSPHRASE=... npx next start -p 3100 &
DATABASE_URL=... ADMIN_PASSPHRASE=... node test/e2e.mjs
```

Set `BASE_URL` if the server is elsewhere, and `CHROMIUM_PATH` if Playwright
can't find a browser on its own.

## Pre-lock isolation

The guard that matters most — no entrant seeing another's picks before the
deadline — lives in `getBoard()` in `src/lib/data.ts`, which returns `null`
until `lock_at` has passed. Nothing about other entrants' picks is queried
before then, so there is no filtered-on-the-client version to leak. Verify by
loading `/board` and an entrant's `/e/<token>` before the lock and grepping the
HTML for another entrant's values; both should come back empty.
