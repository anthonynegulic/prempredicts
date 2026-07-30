import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Banner } from "@/components/Banner";
import { isAdmin } from "@/lib/admin-auth";
import { CLUBS } from "@/lib/clubs";
import { sql } from "@/lib/db";
import { getActiveSeason, getBoard, getOutcomes, getQuestions } from "@/lib/data";
import { QUESTIONS } from "@/lib/questions";
import { setCanonicalPlayer, setOutcome, setWildcardAward } from "../actions";

export const dynamic = "force-dynamic";

export default async function OutcomesPage() {
  if (!(await isAdmin())) {
    return (
      <main id="main">
        <Banner pattern="pinstripe">
          <h2 style={{ fontSize: "clamp(20px,3.6vw,32px)" }}>Admin</h2>
        </Banner>
        <div className="wrap block">
          <div className="note">
            <b>Not signed in</b>
            <br />
            <Link href="/admin">Enter the passphrase</Link> first.
          </div>
        </div>
      </main>
    );
  }

  const season = await getActiveSeason();
  if (!season) {
    return (
      <main id="main">
        <Banner pattern="pinstripe">
          <h2 style={{ fontSize: "clamp(20px,3.6vw,32px)" }}>Admin</h2>
        </Banner>
        <div className="wrap block">
          <div className="note">
            <b>No active season</b>
          </div>
        </div>
      </main>
    );
  }

  const [questions, outcomes, board] = await Promise.all([
    getQuestions(season.id),
    getOutcomes(season.id),
    getBoard(season),
  ]);

  const outcomeOf = (qid: number, slot: number) =>
    outcomes.find((o) => o.question_id === qid && o.slot_index === slot)
      ?.canonical_value ?? "";

  const slotLabel = (key: string, i: number) =>
    QUESTIONS.find((q) => q.key === key)?.slotLabels?.[i] ?? "Answer";

  // Free-text picks needing a canonical mapping. Never auto-matched.
  const freeTextQuestions = questions.filter(
    (q) => q.input_type === "free_text" && q.key !== "wildcard"
  );
  const unmapped = await sql<
    {
      id: number;
      raw_value: string | null;
      canonical_player_id: string | null;
      display_name: string;
      question_label: string;
    }[]
  >`
    select p.id, p.raw_value, p.canonical_player_id,
           e.display_name, q.label as question_label
    from picks p
    join entrants e on e.id = p.entrant_id
    join questions q on q.id = p.question_id
    where p.season_id = ${season.id}
      and q.input_type = 'free_text' and q.key <> 'wildcard'
      and coalesce(p.raw_value, '') <> ''
    order by q.sort_order, e.display_name
  `;

  return (
    <main id="main">
      <Banner pattern="pinstripe">
        <h2 style={{ fontSize: "clamp(20px,3.6vw,32px)" }}>Outcomes &amp; Scoring</h2>
        <nav className="nav" style={{ marginTop: 16 }} aria-label="Admin sections">
          <Link href="/admin">Entrants</Link>
          <Link href="/admin/audit">Audit trail</Link>
          <Link href="/board">Board</Link>
        </nav>
      </Banner>

      <div className="wrap block">
        <p className="hint">
          Enter what actually happened · everyone rescores the moment you save
        </p>

        {questions
          .filter((q) => q.points_config.rule !== "manual_award")
          .map((q) => (
            <div className="qcard" key={q.id}>
              <div className="qhead">
                <span className="qt">{q.label}</span>
                <span className="qp">
                  {q.input_type === "club_set" ? "Order ignored" : "Exact positions"}
                </span>
              </div>
              <div className="qbody">
                {Array.from({ length: q.slot_count }, (_, i) => (
                  <ActionForm
                    key={i}
                    action={setOutcome}
                    submitLabel="Save"
                    style={{ marginBottom: 12 }}
                  >
                    <input type="hidden" name="question_id" value={q.id} />
                    <input type="hidden" name="slot_index" value={i} />
                    <div className="field" style={{ marginBottom: 10, maxWidth: 340 }}>
                      <label htmlFor={`o-${q.id}-${i}`}>{slotLabel(q.key, i)}</label>
                      {q.input_type === "free_text" ? (
                        <input
                          id={`o-${q.id}-${i}`}
                          name="canonical_value"
                          type="text"
                          defaultValue={outcomeOf(q.id, i)}
                          placeholder="Leave blank until resolved"
                          maxLength={120}
                        />
                      ) : (
                        <select
                          id={`o-${q.id}-${i}`}
                          name="canonical_value"
                          defaultValue={outcomeOf(q.id, i)}
                        >
                          <option value="">— Not resolved —</option>
                          {CLUBS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </ActionForm>
                ))}
              </div>
            </div>
          ))}

        <h2 style={{ margin: "32px 0 8px", fontSize: "clamp(20px,4vw,32px)" }}>
          Wildcard vote
        </h2>
        <p className="hint">
          Not scored automatically · award the 5 points by hand once the group has
          voted
        </p>
        {!board ? (
          <div className="empty">
            <p>Available once picks lock</p>
          </div>
        ) : (
          board.entrants.map((e) => {
            const wc = e.score.byQuestion.get("wildcard");
            return (
              <div className="qcard" key={e.entrant.id}>
                <div className="qhead">
                  <span className="qt">{e.entrant.display_name}</span>
                  <span className="qp">{wc?.points ?? 0} pts awarded</span>
                </div>
                <div className="qbody">
                  <p className="help">
                    {wc?.slots[0]?.value ?? "Nobody backed this one"}
                  </p>
                  <ActionForm action={setWildcardAward} submitLabel="Save">
                    <input type="hidden" name="entrant_id" value={e.entrant.id} />
                    <div className="field" style={{ marginBottom: 10, maxWidth: 200 }}>
                      <label htmlFor={`w-${e.entrant.id}`}>Points</label>
                      <select
                        id={`w-${e.entrant.id}`}
                        name="points"
                        defaultValue={String(wc?.points ?? 0)}
                      >
                        <option value="0">0 — humiliation only</option>
                        <option value="5">5 — group voted it good</option>
                      </select>
                    </div>
                  </ActionForm>
                </div>
              </div>
            );
          })
        )}

        <h2 style={{ margin: "32px 0 8px", fontSize: "clamp(20px,4vw,32px)" }}>
          Canonical player mapping
        </h2>
        <p className="hint">
          {freeTextQuestions.length} free-text questions · map each once, by hand ·
          nothing here is auto-matched
        </p>
        <div className="note" style={{ marginBottom: 18 }}>
          <b>Why by hand</b>
          <br />
          &ldquo;Saka&rdquo;, &ldquo;Bukayo Saka&rdquo; and &ldquo;saka&rdquo; are
          the same player and no automatic match can be trusted to know that.
          Roughly {unmapped.length} mappings, once, in twenty minutes. Scoring uses
          the mapped value when it&apos;s set and the raw text when it isn&apos;t.
        </div>
        {unmapped.length === 0 ? (
          <div className="empty">
            <p>No free-text picks entered yet</p>
          </div>
        ) : (
          unmapped.map((p) => (
            <div className="linkrow" key={p.id} style={{ background: "var(--white)", border: "2px solid var(--ink)", marginBottom: 8 }}>
              <span style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--grey)", fontWeight: 700, minWidth: 160 }}>
                {p.display_name} · {p.question_label}
              </span>
              <b className="cond" style={{ fontSize: 16 }}>{p.raw_value}</b>
              <ActionForm action={setCanonicalPlayer} submitLabel="Map">
                <input type="hidden" name="pick_id" value={p.id} />
                <input
                  name="canonical_player_id"
                  type="text"
                  defaultValue={p.canonical_player_id ?? ""}
                  placeholder="Canonical name"
                  aria-label={`Canonical player for ${p.display_name}`}
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 16,
                    padding: "8px 10px",
                    border: "2px solid var(--ink)",
                    marginRight: 8,
                    minWidth: 180,
                  }}
                />
              </ActionForm>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
