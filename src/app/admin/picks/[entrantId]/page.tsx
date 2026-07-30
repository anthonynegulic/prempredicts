import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { Banner } from "@/components/Banner";
import { isAdmin } from "@/lib/admin-auth";
import { CLUBS } from "@/lib/clubs";
import { sql } from "@/lib/db";
import { getActiveSeason, getOwnPicks, getQuestions, isLocked } from "@/lib/data";
import { QUESTIONS } from "@/lib/questions";
import { editPick } from "../../actions";

export const dynamic = "force-dynamic";

export default async function AdminPicksPage({
  params,
}: {
  params: Promise<{ entrantId: string }>;
}) {
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

  const { entrantId } = await params;
  const id = Number(entrantId);
  if (!Number.isInteger(id)) notFound();

  const season = await getActiveSeason();
  if (!season) notFound();

  const [entrant] = await sql<
    { id: number; display_name: string; season_id: number }[]
  >`select id, display_name, season_id from entrants where id = ${id}`;
  if (!entrant || entrant.season_id !== season.id) notFound();

  const [questions, picks] = await Promise.all([
    getQuestions(season.id),
    getOwnPicks(entrant.id),
  ]);

  const audit = await sql<
    {
      question_key: string;
      slot_index: number;
      previous_value: string | null;
      new_value: string | null;
      reason: string | null;
      changed_at: Date;
    }[]
  >`
    select question_key, slot_index, previous_value, new_value, reason, changed_at
    from pick_audit where entrant_id = ${entrant.id}
    order by changed_at desc limit 50
  `;

  const valueOf = (qid: number, slot: number) =>
    picks.find((p) => p.question_id === qid && p.slot_index === slot)?.raw_value ?? "";

  const slotLabel = (key: string, i: number) =>
    QUESTIONS.find((q) => q.key === key)?.slotLabels?.[i] ?? `Slot ${i + 1}`;

  return (
    <main id="main">
      <Banner pattern="pinstripe">
        <h2 style={{ fontSize: "clamp(20px,3.6vw,32px)" }}>
          Edit · {entrant.display_name}
        </h2>
        <nav className="nav" style={{ marginTop: 16 }} aria-label="Admin sections">
          <Link href="/admin">Entrants</Link>
          <Link href="/admin/audit">Audit trail</Link>
        </nav>
      </Banner>

      <div className="wrap block">
        <div className="note" style={{ marginBottom: 22 }}>
          <b>Every edit is logged</b>
          <br />
          A reason is required on each one, and the entrant sees an &ldquo;edited by
          admin&rdquo; flag on their pick. You are also a player — the audit trail
          is what makes the result credible.
          {isLocked(season)
            ? " Picks are locked, so any change here is visible on the board immediately."
            : " Picks are still open, so the entrant can change this back themselves."}
        </div>

        {questions.map((q) => (
          <div className="qcard" key={q.id}>
            <div className="qhead">
              <span className="qt">{q.label}</span>
            </div>
            <div className="qbody">
              {Array.from({ length: q.slot_count }, (_, i) => (
                <ActionForm
                  key={i}
                  action={editPick}
                  submitLabel="Save & log"
                  style={{ marginBottom: 16 }}
                >
                  <input type="hidden" name="entrant_id" value={entrant.id} />
                  <input type="hidden" name="question_id" value={q.id} />
                  <input type="hidden" name="slot_index" value={i} />
                  <div className="slots multi" style={{ marginBottom: 10 }}>
                    <div className="field">
                      <label htmlFor={`v-${q.id}-${i}`}>{slotLabel(q.key, i)}</label>
                      {q.input_type === "free_text" ? (
                        <input
                          id={`v-${q.id}-${i}`}
                          name="value"
                          type="text"
                          defaultValue={valueOf(q.id, i)}
                          maxLength={120}
                        />
                      ) : (
                        <select
                          id={`v-${q.id}-${i}`}
                          name="value"
                          defaultValue={valueOf(q.id, i)}
                        >
                          <option value="">— Blank —</option>
                          {CLUBS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="field">
                      <label htmlFor={`r-${q.id}-${i}`}>Reason (required)</label>
                      <input
                        id={`r-${q.id}-${i}`}
                        name="reason"
                        type="text"
                        placeholder="Sent by DM before lock"
                        maxLength={120}
                      />
                    </div>
                  </div>
                </ActionForm>
              ))}
            </div>
          </div>
        ))}

        <h2 style={{ margin: "30px 0 14px", fontSize: "clamp(20px,4vw,32px)" }}>
          Audit trail
        </h2>
        {audit.length === 0 ? (
          <div className="empty">
            <p>No admin edits to this entry</p>
          </div>
        ) : (
          <div className="panel">
            <h3>Last {audit.length}</h3>
            {audit.map((a, i) => (
              <div className="row" key={i} style={{ display: "block" }}>
                <span style={{ display: "block", marginBottom: 4 }}>
                  {new Date(a.changed_at).toISOString().slice(0, 16).replace("T", " ")} UTC ·{" "}
                  {a.question_key} #{a.slot_index + 1}
                </span>
                <b style={{ display: "block", textAlign: "left" }}>
                  {a.previous_value ?? "blank"} → {a.new_value ?? "blank"}
                </b>
                {a.reason && (
                  <span
                    style={{
                      display: "block",
                      textTransform: "none",
                      letterSpacing: 0,
                      fontSize: 12,
                      color: "#4a4c58",
                      fontWeight: 500,
                      marginTop: 4,
                    }}
                  >
                    {a.reason}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
