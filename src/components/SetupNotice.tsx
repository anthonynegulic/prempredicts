import { Banner } from "./Banner";

/**
 * Shown when there's no active season. Distinguishes "the database can't be
 * reached" from "the database is fine but nothing is seeded" — they look
 * identical from the outside and have completely different fixes.
 */
export function SetupNotice({ error }: { error?: string | null }) {
  return (
    <main id="main">
      <Banner pattern="flat" tight={false} showLabel={false}>
        <div className="eyebrow">{error ? "Can't reach the database" : "Not set up yet"}</div>
        <h1>
          Predictions<span className="stroke">League</span>
        </h1>
      </Banner>
      <div className="wrap block">
        {error ? (
          <div className="note">
            <b>The database didn&apos;t answer</b>
            <br />
            The site is running, so this is the connection, not the code. Check{" "}
            <code>DATABASE_URL</code> in <code>.env.local</code> — it should be
            the <b>pooled</b> Neon string, on one line, ending in{" "}
            <code>?sslmode=require</code>.
            <br />
            <br />
            <span className="mono">{error}</span>
          </div>
        ) : (
          <div className="note">
            <b>Connected, but no active season</b>
            <br />
            The database is reachable and empty. Run these two, in this order:
            <br />
            <br />
            <span className="mono">npm run db:push</span>
            <br />
            <span className="mono">npm run db:seed</span>
            <br />
            <br />
            The seed prints one magic link per entrant. Rename the placeholders in{" "}
            <a href="/admin">admin</a> before you send them out.
          </div>
        )}
      </div>
    </main>
  );
}
