import Link from "next/link";
import { Banner } from "@/components/Banner";
import { Countdown } from "@/components/Countdown";
import { initials } from "@/components/Shirt";
import {
  getEntrants,
  getQuestions,
  isLocked,
  isPlaceholderEntrant,
  loadActiveSeason,
} from "@/lib/data";
import { maxPoints, scoringLine } from "@/lib/questions";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { season, error } = await loadActiveSeason();
  if (!season) return <SetupNotice error={error} />;

  const [questions, allEntrants] = await Promise.all([
    getQuestions(season.id),
    getEntrants(season.id),
  ]);
  // Seeded slots the admin hasn't renamed yet are placeholders, not entrants —
  // keep them off every page a player sees.
  const entrants = allEntrants.filter((e) => !isPlaceholderEntrant(e.display_name));

  const locked = isLocked(season);
  const totals = maxPoints(
    questions.map((q) => ({ pointsConfig: q.points_config, slotCount: q.slot_count }))
  );

  return (
    <main id="main">
      {/* ===== 01 FLAT — HERO ===== */}
      <Banner pattern="flat" tight={false} showLabel={false}>
        <div className="eyebrow">
          Premier League {season.label.replace("-", "/")} · Entries locked 21 August
        </div>
        <h1>
          Predictions<span className="stroke">League</span>
        </h1>
        <div className="facts">
          <div className="fact">
            <b>{String(entrants.length).padStart(2, "0")}</b>
            <i>Entrants</i>
          </div>
          <div className="fact">
            <b>{questions.length}</b>
            <i>Picks each</i>
          </div>
          <div className="fact hot">
            <b>{totals.base}</b>
            <i>Points up</i>
          </div>
        </div>
        <div style={{ marginTop: 24 }}>
          <Countdown lockAt={new Date(season.lock_at).toISOString()} locked={locked} />
        </div>
        <nav className="nav" style={{ marginTop: 26 }} aria-label="Sections">
          {locked ? <Link href="/board">Reveal board</Link> : null}
          <Link href="/rules">Scoring</Link>
        </nav>
      </Banner>

      <div className="wrap block">
        <p className="hint">
          Ten picks each · hidden until the deadline · then revealed and frozen
        </p>

        <div className="note" style={{ marginBottom: 26 }}>
          <b>How it works</b>
          <br />
          Everyone gets a private link. Use it to make your ten picks and change
          them as often as you like until 21 August. Nobody — including the admin
          — sees anyone else&apos;s picks before the deadline. At 20:00 BST on
          Friday 21 August everything reveals at once and goes read-only.{" "}
          {locked
            ? "That has happened. The board is up."
            : "Lose your link and the admin can send you a new one."}
        </div>

        <h2 style={{ marginBottom: 14 }}>What you&apos;re playing for</h2>
        <div className="rules" style={{ maxWidth: 640 }}>
          {questions.map((q) => (
            <div className="r" key={q.key}>
              <span>{q.label}</span>
              <span>{scoringLine(q.points_config, q.slot_count)}</span>
            </div>
          ))}
          <div className="r tot">
            <span>Maximum</span>
            <span>
              {totals.base} pts
              {totals.bonus > 0 ? ` · ${totals.total} with the wildcard vote` : ""}
            </span>
          </div>
        </div>

        <h2 style={{ margin: "34px 0 14px" }}>Who&apos;s in</h2>
        {entrants.length === 0 ? (
          <div className="empty">
            <p>
              {allEntrants.length === 0
                ? "Nobody seeded yet"
                : "Names not set yet"}
            </p>
          </div>
        ) : (
          <div className="two">
            <div className="panel">
              <h3>Entrants</h3>
              {entrants.map((e) => (
                <div className="row" key={e.id}>
                  <span>{initials(e.display_name)}</span>
                  <b>
                    {e.display_name}
                    {e.club_affiliation ? ` · ${e.club_affiliation}` : ""}
                  </b>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== 06 PINSTRIPE — FOOTER ===== */}
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
