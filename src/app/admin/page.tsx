import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Banner } from "@/components/Banner";
import { JoinLink } from "@/components/CopyLink";
import { SetupNotice } from "@/components/SetupNotice";
import { isAdmin } from "@/lib/admin-auth";
import { CLUBS } from "@/lib/clubs";
import {
  countAnswered,
  getActiveSeason,
  getEntrants,
  getQuestions,
  getOwnPicks,
  isLocked,
} from "@/lib/data";
import { createEntrant, login, resetEntrantAccess, updateEntrant } from "./actions";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authed = await isAdmin();

  if (!authed) {
    return (
      <main id="main">
        {/* ===== 06 PINSTRIPE — quietest pattern, least public page ===== */}
        <Banner pattern="pinstripe">
          <h2 style={{ fontSize: "clamp(20px,3.6vw,32px)" }}>Admin</h2>
        </Banner>
        <div className="wrap block">
          <div className="qcard" style={{ maxWidth: 420 }}>
            <div className="qhead">
              <span className="qt">Passphrase</span>
            </div>
            <div className="qbody">
              <ActionForm action={login} submitLabel="Enter" submitClass="btn">
                <div className="field" style={{ marginBottom: 14 }}>
                  <label htmlFor="passphrase">Admin passphrase</label>
                  <input
                    id="passphrase"
                    name="passphrase"
                    type="password"
                    autoComplete="current-password"
                  />
                </div>
              </ActionForm>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const season = await getActiveSeason().catch(() => null);
  if (!season) return <SetupNotice />;

  const [questions, entrants] = await Promise.all([
    getQuestions(season.id),
    getEntrants(season.id),
  ]);
  const locked = isLocked(season);

  const progress = await Promise.all(
    entrants.map(async (e) => ({
      id: e.id,
      answered: countAnswered(questions, await getOwnPicks(e.id)),
    }))
  );
  const answeredBy = new Map(progress.map((p) => [p.id, p.answered]));

  return (
    <main id="main">
      {/* ===== 06 PINSTRIPE — ADMIN ===== */}
      <Banner pattern="pinstripe">
        <h2 style={{ fontSize: "clamp(20px,3.6vw,32px)" }}>Admin</h2>
        <nav className="nav" style={{ marginTop: 16 }} aria-label="Admin sections">
          <Link href="/admin">Entrants</Link>
          <Link href="/admin/outcomes">Outcomes &amp; scoring</Link>
          <Link href="/admin/audit">Audit trail</Link>
          <Link href="/">Site</Link>
        </nav>
      </Banner>

      <div className="wrap block">
        <p className="hint">
          {locked
            ? "Picks are locked · edits still possible, and every one is logged"
            : `Open until lock · ${new Date(season.lock_at).toISOString().replace("T", " ").slice(0, 16)} UTC`}
        </p>

        <div className="qcard" style={{ maxWidth: 620, marginBottom: 26 }}>
          <div className="qhead">
            <span className="qt">The link to share</span>
          </div>
          <div className="qbody">
            <p className="help">
              One link for everyone. Send it to the group chat. Each person picks
              their own name from the list below and sets a PIN.
            </p>
            <div className="linkrow" style={{ padding: 0 }}>
              <JoinLink />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
          <h2 style={{ fontSize: "clamp(20px,4vw,32px)" }}>Entrants</h2>
          <LogoutButton />
        </div>

        {entrants.map((e) => (
          <div className="qcard" key={e.id}>
            <div className="qhead">
              <span className="qt">{e.display_name}</span>
              <span className="qp">
                {e.claimed_at ? "Joined" : "Not joined"} ·{" "}
                {answeredBy.get(e.id) ?? 0} of {questions.length} picks
              </span>
            </div>
            <div className="qbody">

              <ActionForm action={updateEntrant} submitLabel="Save">
                <input type="hidden" name="entrant_id" value={e.id} />
                <div className="slots multi" style={{ marginBottom: 12 }}>
                  <div className="field">
                    <label htmlFor={`n-${e.id}`}>Display name</label>
                    <input
                      id={`n-${e.id}`}
                      name="display_name"
                      type="text"
                      defaultValue={e.display_name}
                      maxLength={40}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`c-${e.id}`}>Club affiliation</label>
                    <select
                      id={`c-${e.id}`}
                      name="club_affiliation"
                      defaultValue={e.club_affiliation ?? ""}
                    >
                      <option value="">— None —</option>
                      {CLUBS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`a-${e.id}`}>Face (square image path)</label>
                    <input
                      id={`a-${e.id}`}
                      name="avatar_url"
                      type="text"
                      placeholder={`/faces/${e.slug}.jpg`}
                      defaultValue={e.avatar_url ?? ""}
                    />
                  </div>
                </div>
              </ActionForm>

              <div
                style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}
              >
                <Link className="btn sm ghost" href={`/admin/picks/${e.id}`}>
                  Edit picks
                </Link>
                <ActionForm
                  action={resetEntrantAccess}
                  submitLabel="Reset access"
                  submitClass="btn sm danger"
                  confirm={`Reset ${e.display_name}'s access? Their PIN is cleared and the name becomes claimable again. Their picks are kept.`}
                >
                  <input type="hidden" name="entrant_id" value={e.id} />
                </ActionForm>
              </div>
            </div>
          </div>
        ))}

        <div className="qcard" style={{ maxWidth: 520, marginTop: 26 }}>
          <div className="qhead">
            <span className="qt">Add an entrant</span>
          </div>
          <div className="qbody">
            <p className="help">
              Names are set here, never typed by the entrant — that is what stops
              Dave, dave and Davo becoming three people. Whoever you add appears
              as a claimable name on the shared join link.
            </p>
            <ActionForm action={createEntrant} submitLabel="Add">
              <div className="slots multi" style={{ marginBottom: 12 }}>
                <div className="field">
                  <label htmlFor="new-name">Display name</label>
                  <input id="new-name" name="display_name" type="text" maxLength={40} />
                </div>
                <div className="field">
                  <label htmlFor="new-club">Club affiliation</label>
                  <select id="new-club" name="club_affiliation" defaultValue="">
                    <option value="">— None —</option>
                    {CLUBS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </ActionForm>
          </div>
        </div>
      </div>
    </main>
  );
}
