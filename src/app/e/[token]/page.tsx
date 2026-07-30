import Link from "next/link";
import { notFound } from "next/navigation";
import { Banner } from "@/components/Banner";
import { Countdown } from "@/components/Countdown";
import {
  countAnswered,
  getActiveSeason,
  getEntrantByToken,
  getOwnPicks,
  getQuestions,
  isLocked,
} from "@/lib/data";
import { QUESTIONS } from "@/lib/questions";
import { EntryForm, type FormQuestion } from "./EntryForm";

export const dynamic = "force-dynamic";

const slotLabelsFor = (key: string, count: number): string[] => {
  const seed = QUESTIONS.find((q) => q.key === key);
  if (seed?.slotLabels) return seed.slotLabels;
  return Array.from({ length: count }, () => seed?.label ?? "Pick");
};

export default async function EntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const entrant = await getEntrantByToken(token);
  if (!entrant) notFound();

  const season = await getActiveSeason();
  if (!season || season.id !== entrant.season_id) notFound();

  const [questions, picks] = await Promise.all([
    getQuestions(season.id),
    getOwnPicks(entrant.id),
  ]);

  const locked = isLocked(season);
  const answered = countAnswered(questions, picks);

  const initial: Record<string, string> = {};
  const editedAt = new Map<string, string>();
  for (const p of picks) {
    const q = questions.find((x) => x.id === p.question_id);
    if (!q) continue;
    initial[`${q.key}::${p.slot_index}`] = p.raw_value ?? "";
    if (p.edited_by_admin_at) {
      editedAt.set(q.key, new Date(p.edited_by_admin_at).toISOString());
    }
  }

  const formQuestions: FormQuestion[] = questions.map((q) => ({
    key: q.key,
    label: q.label,
    inputType: q.input_type,
    slotCount: q.slot_count,
    helpText: q.help_text,
    sortOrder: q.sort_order,
    pointsConfig: q.points_config,
    slotLabels: slotLabelsFor(q.key, q.slot_count),
    adminEditedAt: editedAt.get(q.key) ?? null,
  }));

  return (
    <main id="main">
      {/* ===== 01 FLAT — ENTRY FORM ===== */}
      <Banner pattern="flat" tight={false} showLabel={false}>
        <div className="eyebrow">
          Premier League {season.label.replace("-", "/")} · Your picks
        </div>
        <h1 style={{ fontSize: "clamp(36px,9vw,74px)" }}>{entrant.display_name}</h1>
        {entrant.club_affiliation && (
          <p className="bsub">{entrant.club_affiliation}</p>
        )}

        <div style={{ marginTop: 22 }}>
          <Countdown lockAt={new Date(season.lock_at).toISOString()} locked={locked} />
        </div>

        <p className="bsub" style={{ marginTop: 18 }}>
          {answered} of {questions.length} picks made
        </p>
        <div
          className="prog"
          role="img"
          aria-label={`${answered} of ${questions.length} picks made`}
        >
          {questions.map((q, i) => (
            <span key={q.key} className={i < answered ? "on" : ""} />
          ))}
        </div>

        <nav className="nav" style={{ marginTop: 24 }} aria-label="Sections">
          <Link href="/rules">Scoring</Link>
          {locked ? <Link href="/board">Reveal board</Link> : null}
        </nav>
      </Banner>

      {locked ? (
        <div className="wrap block">
          <div className="note" style={{ marginBottom: 20 }}>
            <b>Picks locked 21 August</b>
            <br />
            These are read-only now. Everyone&apos;s picks are on the{" "}
            <Link href="/board">reveal board</Link>.
          </div>
          <div className="two">
            <div className="panel">
              <h3>Your ten</h3>
              {formQuestions.map((q) => {
                const vals = Array.from(
                  { length: q.slotCount },
                  (_, i) => initial[`${q.key}::${i}`] ?? ""
                ).filter(Boolean);
                return (
                  <div className="row" key={q.key}>
                    <span>{q.label}</span>
                    <b>
                      {vals.length > 0 ? vals.join(" · ") : "Not entered"}
                      {q.adminEditedAt && <span className="flag">Admin edit</span>}
                    </b>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <EntryForm token={token} questions={formQuestions} initial={initial} />
      )}
    </main>
  );
}
