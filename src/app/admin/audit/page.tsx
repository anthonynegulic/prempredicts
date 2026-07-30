import Link from "next/link";
import { Banner } from "@/components/Banner";
import { isAdmin } from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { getActiveSeason } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
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
  const rows = season
    ? await sql<
        {
          display_name: string | null;
          question_key: string | null;
          slot_index: number | null;
          previous_value: string | null;
          new_value: string | null;
          reason: string | null;
          changed_by: string;
          changed_at: Date;
        }[]
      >`
        select e.display_name, a.question_key, a.slot_index, a.previous_value,
               a.new_value, a.reason, a.changed_by, a.changed_at
        from pick_audit a
        left join entrants e on e.id = a.entrant_id
        order by a.changed_at desc
        limit 200
      `
    : [];

  return (
    <main id="main">
      <Banner pattern="pinstripe">
        <h2 style={{ fontSize: "clamp(20px,3.6vw,32px)" }}>Audit Trail</h2>
        <nav className="nav" style={{ marginTop: 16 }} aria-label="Admin sections">
          <Link href="/admin">Entrants</Link>
          <Link href="/admin/outcomes">Outcomes &amp; scoring</Link>
        </nav>
      </Banner>

      <div className="wrap block">
        <p className="hint">
          Every admin edit to every pick · newest first · this is the record
        </p>
        {rows.length === 0 ? (
          <div className="empty">
            <p>No admin edits yet</p>
          </div>
        ) : (
          <div className="tablescroll">
            <div className="tal" style={{ minWidth: 620 }}>
              <div className="th" style={{ gridTemplateColumns: "150px 1fr 1fr 1fr" }}>
                <span>When (UTC)</span>
                <span>Who / what</span>
                <span>Change</span>
                <span>Reason</span>
              </div>
              {rows.map((r, i) => (
                <div
                  className="tr"
                  key={i}
                  style={{ gridTemplateColumns: "150px 1fr 1fr 1fr" }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {new Date(r.changed_at).toISOString().slice(0, 16).replace("T", " ")}
                  </div>
                  <div>
                    <div className="pn" style={{ fontSize: 15 }}>
                      {r.display_name ?? "Deleted entrant"}
                    </div>
                    <div className="pc">
                      {r.question_key} #{(r.slot_index ?? 0) + 1}
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                    {r.previous_value ?? "blank"} → {r.new_value ?? "blank"}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#4a4c58" }}>
                    {r.reason ?? "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
