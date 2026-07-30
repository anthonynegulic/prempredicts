import Link from "next/link";
import { Banner } from "@/components/Banner";
import { SetupNotice } from "@/components/SetupNotice";
import { CLUBS } from "@/lib/clubs";
import { getQuestions, loadActiveSeason } from "@/lib/data";
import { maxPoints, scoringLine } from "@/lib/questions";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const { season, error } = await loadActiveSeason();
  if (!season) return <SetupNotice error={error} />;

  const questions = await getQuestions(season.id);
  const totals = maxPoints(
    questions.map((q) => ({ pointsConfig: q.points_config, slotCount: q.slot_count }))
  );

  return (
    <main id="main">
      {/* ===== 01 FLAT — part of the entry funnel ===== */}
      <Banner pattern="flat" showLabel={false}>
        <div className="eyebrow">Read this before you enter</div>
        <h2>Scoring &amp; Definitions</h2>
        <nav className="nav" style={{ marginTop: 20 }} aria-label="Sections">
          <Link href="/">Home</Link>
        </nav>
      </Banner>

      <div className="wrap block">
        <p className="hint">
          Every definition is fixed now, in writing · there is nothing to argue
          about in May
        </p>

        <div className="rules" style={{ maxWidth: 640, marginBottom: 30 }}>
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

        <h2 style={{ marginBottom: 14 }}>The small print</h2>
        <div className="two">
          <div className="panel">
            <h3>Definitions</h3>
            {questions.map((q) => (
              <div className="row" key={q.key} style={{ display: "block" }}>
                <span style={{ display: "block", marginBottom: 4 }}>{q.label}</span>
                <span
                  style={{
                    display: "block",
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    color: "#4a4c58",
                    letterSpacing: 0,
                    textTransform: "none",
                    fontWeight: 500,
                  }}
                >
                  {q.help_text}
                </span>
              </div>
            ))}
          </div>
          <div>
            <div className="note" style={{ marginBottom: 12 }}>
              <b>Why no Europa or Conference spots</b>
              <br />
              They depend on cup winners and UEFA coefficients, which nobody can
              settle at entry time. The 5th/6th/7th question covers the same
              ground without the argument.
            </div>
            <div className="note" style={{ marginBottom: 12 }}>
              <b>Partial credit on the top four</b>
              <br />
              Right club in the wrong position still scores 1. Without it, exact
              order is brutal enough that most people score zero on the biggest
              question and stop caring by October.
            </div>
            <div className="note">
              <b>The twenty clubs</b>
              <br />
              {CLUBS.join(" · ")}
            </div>
          </div>
        </div>
      </div>

      <Banner pattern="pinstripe" showLabel={false}>
        <div className="foot">Predictions League · {season.label}</div>
      </Banner>
    </main>
  );
}
