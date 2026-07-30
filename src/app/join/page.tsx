import Link from "next/link";
import { redirect } from "next/navigation";
import { Banner } from "@/components/Banner";
import { Countdown } from "@/components/Countdown";
import { SetupNotice } from "@/components/SetupNotice";
import { getEntrants, isLocked, isPlaceholderEntrant, loadActiveSeason } from "@/lib/data";
import { getSessionEntrantId } from "@/lib/entrant-auth";
import { JoinForms, type Roster } from "./JoinForms";

export const dynamic = "force-dynamic";

/**
 * The one link everybody gets. Pattern 01 Flat — this is the entry funnel.
 */
export default async function JoinPage() {
  const { season, error } = await loadActiveSeason();
  if (!season) return <SetupNotice error={error} />;

  // Already signed in on this device? Nothing to do here.
  if (await getSessionEntrantId()) redirect("/picks");

  const allEntrants = await getEntrants(season.id);
  const locked = isLocked(season);

  // Seeded slots the admin hasn't renamed yet aren't real people — don't let
  // anyone claim "Entrant 6" as their identity.
  const entrants = allEntrants.filter((e) => !isPlaceholderEntrant(e.display_name));

  const roster: Roster = entrants.map((e) => ({
    id: e.id,
    displayName: e.display_name,
    club: e.club_affiliation,
    claimed: e.claimed_at !== null,
  }));

  const joined = roster.filter((r) => r.claimed).length;

  return (
    <main id="main">
      <Banner pattern="flat" tight={false} showLabel={false}>
        <div className="eyebrow">
          Premier League {season.label.replace("-", "/")} · Ten picks each
        </div>
        <h1>
          Predictions<span className="stroke">League</span>
        </h1>
        <div className="facts">
          <div className="fact">
            <b>{joined}</b>
            <i>Joined</i>
          </div>
          <div className="fact hot">
            <b>{roster.length - joined}</b>
            <i>Yet to join</i>
          </div>
        </div>
        <div style={{ marginTop: 22 }}>
          <Countdown lockAt={new Date(season.lock_at).toISOString()} locked={locked} />
        </div>
        <nav className="nav" style={{ marginTop: 24 }} aria-label="Sections">
          <Link href="/rules">Scoring</Link>
          {locked ? <Link href="/board">Reveal board</Link> : null}
        </nav>
      </Banner>

      <div className="wrap block">
        {locked ? (
          <div className="note" style={{ marginBottom: 20 }}>
            <b>Picks locked 21 August</b>
            <br />
            Entries are closed. You can still sign in to see your own, and
            everyone&apos;s are on the{" "}
            <Link href="/board">reveal board</Link>.
          </div>
        ) : (
          <p className="hint">
            One link for everyone · claim your name once, then it&apos;s yours
          </p>
        )}

        <JoinForms roster={roster} />
      </div>

      <Banner pattern="pinstripe" showLabel={false}>
        <div
          className="foot"
          style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
        >
          <span>Predictions League · {season.label}</span>
          <Link href="/admin" style={{ color: "rgba(255,255,255,.6)" }}>
            Admin
          </Link>
        </div>
      </Banner>
    </main>
  );
}
