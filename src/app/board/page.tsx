import Link from "next/link";
import { Banner } from "@/components/Banner";
import { Countdown } from "@/components/Countdown";
import { SetupNotice } from "@/components/SetupNotice";
import { Shirt } from "@/components/Shirt";
import { clubTag, shortClub } from "@/lib/clubs";
import { getActiveSeason, getBoard, type Board, type BoardEntrant } from "@/lib/data";
import type { ScoredPick } from "@/lib/scoring";

export const dynamic = "force-dynamic";

/** Slots for one question, in order, for one entrant. */
function slotsOf(e: BoardEntrant, key: string): ScoredPick[] {
  return e.score.byQuestion.get(key)?.slots ?? [];
}

function statusClass(s: ScoredPick["status"]): string {
  if (s === "exact") return " correct";
  if (s === "partial") return " partial";
  return "";
}

/** Groups entrants by the value they picked, for the "backed by" tallies. */
function tally(board: Board, key: string) {
  const groups = new Map<string, { value: string; backers: BoardEntrant[]; status: ScoredPick["status"] }>();
  for (const e of board.entrants) {
    for (const s of slotsOf(e, key)) {
      const v = (s.value ?? "").trim();
      if (!v) continue;
      const k = v.toLowerCase();
      const g = groups.get(k) ?? { value: v, backers: [], status: s.status };
      g.backers.push(e);
      if (s.status === "exact") g.status = "exact";
      groups.set(k, g);
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.backers.length - a.backers.length || a.value.localeCompare(b.value)
  );
}

export default async function BoardPage() {
  const season = await getActiveSeason().catch(() => null);
  if (!season) return <SetupNotice />;

  const board = await getBoard(season);

  // Before lock there is nothing to show and nothing was fetched. The guard is
  // in getBoard, not here — no route can leak picks by forgetting to check.
  if (!board) {
    return (
      <main id="main">
        <Banner pattern="flat" tight={false} showLabel={false}>
          <div className="eyebrow">Nothing to see yet</div>
          <h1>
            Reveal<span className="stroke">Board</span>
          </h1>
          <div style={{ marginTop: 22 }}>
            <Countdown lockAt={new Date(season.lock_at).toISOString()} locked={false} />
          </div>
          <nav className="nav" style={{ marginTop: 24 }} aria-label="Sections">
            <Link href="/">Home</Link>
            <Link href="/rules">Scoring</Link>
          </nav>
        </Banner>
        <div className="wrap block">
          <div className="empty">
            <p>Everyone&apos;s picks appear here the moment it locks</p>
          </div>
        </div>
      </main>
    );
  }

  const { entrants, anyResolved } = board;
  const leader = entrants[0];

  // Compact strip summary: one cell per single-slot question.
  const summaryKeys = [
    { key: "league_winner", label: "Champion" },
    { key: "top_scorer", label: "Top scorer" },
    { key: "player_of_season", label: "Player" },
    { key: "young_player_of_season", label: "Young U21" },
    { key: "most_assists", label: "Assists" },
    { key: "first_manager_sacked", label: "First sacked" },
  ];

  const playerKeys = [
    { key: "top_scorer", title: "Top scorer" },
    { key: "most_assists", title: "Most assists" },
    { key: "player_of_season", title: "Player of the Season" },
    { key: "young_player_of_season", title: "Young Player" },
    { key: "first_manager_sacked", title: "First manager sacked" },
  ];

  return (
    <main id="main">
      {/* ===== 01 FLAT — HERO ===== */}
      <Banner pattern="flat" tight={false} showLabel={false}>
        <div className="eyebrow">
          Premier League {season.label.replace("-", "/")} · Locked and revealed
        </div>
        <h1>
          Reveal<span className="stroke">Board</span>
        </h1>
        <div className="facts">
          <div className="fact">
            <b>{String(entrants.length).padStart(2, "0")}</b>
            <i>Entrants</i>
          </div>
          <div className="fact hot">
            <b>{anyResolved ? leader.score.total : "—"}</b>
            <i>{anyResolved ? "Leader" : "Nothing resolved"}</i>
          </div>
        </div>
        <nav className="nav" style={{ marginTop: 24 }} aria-label="Sections">
          <Link href="/">Home</Link>
          <Link href="/rules">Scoring</Link>
        </nav>
      </Banner>

      {/* ===== 02 STRIPES — STANDINGS ===== */}
      <Banner pattern="stripes">
        <h2>Standings</h2>
      </Banner>
      <div className="wrap block">
        <p className="hint">
          {anyResolved
            ? "Shirt number = current rank · lime cell = pick already correct"
            : "Nothing has resolved yet · shirt number is alphabetical until it does"}
        </p>

        {entrants.map((e, i) => (
          <div className={`strip${anyResolved && e.rank === 1 ? " lead" : ""}`} key={e.entrant.id}>
            <Shirt
              rank={anyResolved ? e.rank : i + 1}
              name={e.entrant.display_name}
              avatarUrl={e.entrant.avatar_url}
              lead={anyResolved && e.rank === 1}
            />
            <div className="sbody">
              <div className="srow">
                <span className="nm">{e.entrant.display_name}</span>
                {e.entrant.club_affiliation && (
                  <span className="cl">{shortClub(e.entrant.club_affiliation)}</span>
                )}
                <span className="pt">
                  {e.score.total}
                  <i>pts</i>
                </span>
              </div>
              <div className="picks">
                {summaryKeys.map(({ key, label }) => {
                  const s = slotsOf(e, key)[0];
                  const v = s?.value?.trim();
                  return (
                    <div className={`p${statusClass(s?.status ?? "unresolved")}`} key={key}>
                      <div className="l">{label}</div>
                      <div className="v">
                        {v ? (
                          key === "league_winner" || key === "first_manager_sacked" ? (
                            shortClub(v)
                          ) : (
                            v
                          )
                        ) : (
                          <span className="blank">Blank</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== 03 BOLT — TOP FOUR ===== */}
      <Banner pattern="bolt">
        <h2>Top Four, In Order</h2>
      </Banner>
      <div className="wrap block">
        <p className="hint">Exact position 3 pts · right club wrong spot 1 pt</p>
        <div className="g4">
          {entrants.map((e) => (
            <div className="c4" key={e.entrant.id}>
              <h3>{e.entrant.display_name}</h3>
              <ol>
                {slotsOf(e, "top_four").map((s) => (
                  <li
                    key={s.slotIndex}
                    className={
                      s.status === "exact" ? "hit" : s.status === "partial" ? "near" : ""
                    }
                  >
                    {s.value ? shortClub(s.value) : <span className="blank">Blank</span>}
                    {s.points > 0 && <span className="sc">+{s.points}</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        <h2 style={{ margin: "34px 0 8px", fontSize: "clamp(20px,4vw,32px)" }}>
          5th, 6th and 7th
        </h2>
        <p className="hint">Exact positions only · 2 pts each</p>
        <div className="g4">
          {entrants.map((e) => (
            <div className="c4" key={e.entrant.id}>
              <h3>{e.entrant.display_name}</h3>
              <ol style={{ counterReset: "p 4" }}>
                {slotsOf(e, "positions_5_6_7").map((s) => (
                  <li key={s.slotIndex} className={s.status === "exact" ? "hit" : ""}>
                    {s.value ? shortClub(s.value) : <span className="blank">Blank</span>}
                    {s.points > 0 && <span className="sc">+{s.points}</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>

      {/* ===== 04 SASH — WHO BACKED WHOM ===== */}
      <Banner pattern="sash">
        <h2>Who Backed Whom</h2>
      </Banner>
      <div className="wrap block">
        <p className="hint">
          Every named pick, and who is riding on it · lime row = already correct
        </p>
        {playerKeys.map(({ key, title }) => {
          const rows = tally(board, key);
          return (
            <div key={key} style={{ marginBottom: 26 }}>
              <h3 style={{ fontSize: 18, marginBottom: 10 }}>{title}</h3>
              {rows.length === 0 ? (
                <div className="empty">
                  <p>Nobody backed anything here</p>
                </div>
              ) : (
                <div className="tal">
                  <div className="th">
                    <span>#</span>
                    <span>Pick</span>
                    <span>Backers</span>
                    <span>Who</span>
                  </div>
                  {rows.map((r, i) => (
                    <div
                      className="tr"
                      key={r.value}
                      style={r.status === "exact" ? { background: "var(--acid)" } : undefined}
                    >
                      <div className="rk">{i + 1}</div>
                      <div>
                        <div className="pn">
                          {key === "first_manager_sacked" ? shortClub(r.value) : r.value}
                        </div>
                        {r.status === "exact" && <div className="pc">Correct</div>}
                      </div>
                      <div className="gl">{r.backers.length}</div>
                      <div className="backers">
                        {r.backers.map((b) => (
                          <span className="bk" key={b.entrant.id}>
                            {b.entrant.display_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ===== 05 HALVES — RELEGATION + WILDCARDS ===== */}
      <Banner pattern="halves">
        <h2>Down &amp; Out · Wildcards</h2>
      </Banner>
      <div className="wrap block">
        <p className="hint">Relegation set is unordered · 3 pts per correct club</p>
        <div className="two">
          <div className="panel">
            <h3>Relegated three</h3>
            {entrants.map((e) => {
              const slots = slotsOf(e, "relegated_three");
              const filled = slots.filter((s) => (s.value ?? "").trim());
              return (
                <div className="row" key={e.entrant.id}>
                  <span>{e.entrant.display_name}</span>
                  <b>
                    {filled.length === 0 ? (
                      <span style={{ color: "var(--grey)" }}>Not entered</span>
                    ) : (
                      filled.map((s, i) => (
                        <span key={s.slotIndex}>
                          {i > 0 && " · "}
                          <span className={s.status === "exact" ? "tag-hit" : undefined}>
                            {clubTag(s.value)}
                          </span>
                        </span>
                      ))
                    )}
                  </b>
                </div>
              );
            })}
          </div>
          <div className="panel">
            <h3>Wildcards</h3>
            {entrants.map((e) => {
              const s = slotsOf(e, "wildcard")[0];
              const v = s?.value?.trim();
              return (
                <div className="row" key={e.entrant.id}>
                  <span>{e.entrant.display_name}</span>
                  <b>
                    {v ?? <span style={{ color: "var(--grey)" }}>Nobody backed this one</span>}
                    {s && s.points > 0 && <span className="flag">+{s.points}</span>}
                  </b>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== 06 PINSTRIPE — FOOTER ===== */}
      <Banner pattern="pinstripe" showLabel={false}>
        <div className="foot">Predictions League · {season.label} · Picks locked</div>
      </Banner>
    </main>
  );
}
