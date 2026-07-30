import { Banner } from "./Banner";

/** Shown when there's no active season — i.e. the database isn't set up yet. */
export function SetupNotice() {
  return (
    <main id="main">
      <Banner pattern="flat" tight={false} showLabel={false}>
        <div className="eyebrow">Not set up yet</div>
        <h1>
          Predictions<span className="stroke">League</span>
        </h1>
      </Banner>
      <div className="wrap block">
        <div className="note">
          <b>No active season</b>
          <br />
          Set <code>DATABASE_URL</code> in <code>.env.local</code>, then run:
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
      </div>
    </main>
  );
}
