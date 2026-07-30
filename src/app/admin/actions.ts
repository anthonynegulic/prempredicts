"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  checkPassphrase,
  endAdminSession,
  requireAdmin,
  startAdminSession,
} from "@/lib/admin-auth";
import { sql } from "@/lib/db";
import { getActiveSeason, getQuestions } from "@/lib/data";

export type ActionState = { error?: string; ok?: string };

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "entrant"
  );
}

export async function login(
  _prev: ActionState,
  form: FormData
): Promise<ActionState> {
  const pass = String(form.get("passphrase") ?? "");
  if (!pass) return { error: "Enter the passphrase." };
  try {
    if (!checkPassphrase(pass)) return { error: "Wrong passphrase." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Auth is not configured." };
  }
  await startAdminSession();
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await endAdminSession();
  redirect("/admin");
}

export async function createEntrant(
  _prev: ActionState,
  form: FormData
): Promise<ActionState> {
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { error: "No active season." };

  const name = String(form.get("display_name") ?? "").trim();
  if (!name) return { error: "Name is required." };
  if (name.length > 40) return { error: "Keep names under 40 characters." };

  const club = String(form.get("club_affiliation") ?? "").trim() || null;
  let slug = slugify(name);

  // Slugs are unique per season; suffix rather than fail.
  const existing = await sql<{ slug: string }[]>`
    select slug from entrants where season_id = ${season.id} and slug like ${slug + "%"}
  `;
  if (existing.some((e) => e.slug === slug)) {
    slug = `${slug}-${existing.length + 1}`;
  }

  await sql`
    insert into entrants (season_id, display_name, slug, club_affiliation)
    values (${season.id}, ${name}, ${slug}, ${club})
  `;
  revalidatePath("/admin");
  return { ok: `${name} added.` };
}

export async function updateEntrant(
  _prev: ActionState,
  form: FormData
): Promise<ActionState> {
  await requireAdmin();
  const id = Number(form.get("entrant_id"));
  if (!Number.isInteger(id)) return { error: "Bad entrant." };

  const name = String(form.get("display_name") ?? "").trim();
  if (!name) return { error: "Name is required." };
  const club = String(form.get("club_affiliation") ?? "").trim() || null;
  const avatar = String(form.get("avatar_url") ?? "").trim() || null;

  await sql`
    update entrants
    set display_name = ${name}, club_affiliation = ${club}, avatar_url = ${avatar}
    where id = ${id}
  `;
  revalidatePath("/admin");
  revalidatePath("/board");
  return { ok: `${name} saved.` };
}

/**
 * Releases a name so it can be claimed again, and clears its PIN. Use when
 * somebody forgets their PIN, or claimed the wrong name.
 *
 * Picks are deliberately left alone — they belong to the name, not the session,
 * so whoever re-claims it picks up the existing entry. That is the right
 * behaviour for a forgotten PIN and the reason the confirm copy spells it out.
 */
export async function resetEntrantAccess(
  _prev: ActionState,
  form: FormData
): Promise<ActionState> {
  await requireAdmin();
  const id = Number(form.get("entrant_id"));
  if (!Number.isInteger(id)) return { error: "Bad entrant." };
  await sql`
    update entrants
    set pin_hash = null, claimed_at = null, pin_failures = 0,
        pin_locked_until = null
    where id = ${id}
  `;
  revalidatePath("/admin");
  revalidatePath("/join");
  return { ok: "Access reset. They can claim the name again and set a new PIN." };
}

/**
 * Admin pick edit. Writes a pick_audit row every time, without exception —
 * the admin is also a player, so the audit trail is what makes the result
 * credible. The edited pick then carries a visible flag on the entrant's page.
 */
export async function editPick(
  _prev: ActionState,
  form: FormData
): Promise<ActionState> {
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { error: "No active season." };

  const entrantId = Number(form.get("entrant_id"));
  const questionId = Number(form.get("question_id"));
  const slotIndex = Number(form.get("slot_index"));
  const reason = String(form.get("reason") ?? "").trim();
  const raw = String(form.get("value") ?? "").trim();

  if (!Number.isInteger(entrantId) || !Number.isInteger(questionId)) {
    return { error: "Bad pick reference." };
  }
  if (!reason) return { error: "A reason is required for every admin edit." };

  const questions = await getQuestions(season.id);
  const q = questions.find((x) => x.id === questionId);
  if (!q) return { error: "Unknown question." };
  if (slotIndex < 0 || slotIndex >= q.slot_count) return { error: "Bad slot." };

  const value = raw === "" ? null : raw;
  const club = q.input_type === "free_text" ? null : value;

  const [prev] = await sql<{ id: number; raw_value: string | null }[]>`
    select id, raw_value from picks
    where entrant_id = ${entrantId} and question_id = ${questionId}
      and slot_index = ${slotIndex}
  `;

  await sql.begin(async (tx) => {
    const [row] = await tx<{ id: number }[]>`
      insert into picks
        (season_id, entrant_id, question_id, slot_index, raw_value, canonical_club,
         edited_by_admin_at)
      values (${season.id}, ${entrantId}, ${questionId}, ${slotIndex}, ${value},
              ${club}, now())
      on conflict (entrant_id, question_id, slot_index) do update set
        raw_value          = excluded.raw_value,
        canonical_club     = excluded.canonical_club,
        edited_by_admin_at = now(),
        updated_at         = now()
      returning id
    `;

    await tx`
      insert into pick_audit
        (pick_id, entrant_id, question_key, slot_index, previous_value, new_value,
         changed_by, reason)
      values (${row.id}, ${entrantId}, ${q.key}, ${slotIndex},
              ${prev?.raw_value ?? null}, ${value}, 'admin', ${reason})
    `;
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/picks/${entrantId}`);
  revalidatePath("/board");
  return { ok: "Pick edited and logged." };
}

/** Maps a free-text pick to a canonical player. Never automatic, never fuzzy. */
export async function setCanonicalPlayer(
  _prev: ActionState,
  form: FormData
): Promise<ActionState> {
  await requireAdmin();
  const pickId = Number(form.get("pick_id"));
  if (!Number.isInteger(pickId)) return { error: "Bad pick." };
  const value = String(form.get("canonical_player_id") ?? "").trim() || null;
  await sql`update picks set canonical_player_id = ${value} where id = ${pickId}`;
  revalidatePath("/admin/outcomes");
  revalidatePath("/board");
  return { ok: "Mapping saved." };
}

/** Records an outcome. Saving any outcome rescores everyone on next render. */
export async function setOutcome(
  _prev: ActionState,
  form: FormData
): Promise<ActionState> {
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { error: "No active season." };

  const questionId = Number(form.get("question_id"));
  const slotIndex = Number(form.get("slot_index"));
  if (!Number.isInteger(questionId) || !Number.isInteger(slotIndex)) {
    return { error: "Bad outcome reference." };
  }

  const questions = await getQuestions(season.id);
  const q = questions.find((x) => x.id === questionId);
  if (!q) return { error: "Unknown question." };
  if (slotIndex < 0 || slotIndex >= q.slot_count) return { error: "Bad slot." };

  const raw = String(form.get("canonical_value") ?? "").trim();
  const value = raw === "" ? null : raw;

  await sql`
    insert into outcomes (season_id, question_id, slot_index, canonical_value,
                          resolved_at, resolved_by)
    values (${season.id}, ${questionId}, ${slotIndex}, ${value},
            ${value ? new Date() : null}, 'admin')
    on conflict (question_id, slot_index) do update set
      canonical_value = excluded.canonical_value,
      resolved_at     = excluded.resolved_at,
      resolved_by     = excluded.resolved_by
  `;

  revalidatePath("/admin/outcomes");
  revalidatePath("/board");
  return { ok: `${q.label} updated. Everyone rescored.` };
}

/** The optional 5-pt wildcard award, after the group votes at season end. */
export async function setWildcardAward(
  _prev: ActionState,
  form: FormData
): Promise<ActionState> {
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { error: "No active season." };

  const entrantId = Number(form.get("entrant_id"));
  const points = Number(form.get("points"));
  if (!Number.isInteger(entrantId)) return { error: "Bad entrant." };
  if (!Number.isFinite(points) || points < 0 || points > 50) {
    return { error: "Points must be between 0 and 50." };
  }

  await sql`
    insert into wildcard_awards (season_id, entrant_id, points, awarded_by)
    values (${season.id}, ${entrantId}, ${points}, 'admin')
    on conflict (entrant_id) do update set
      points = excluded.points, awarded_at = now(), awarded_by = 'admin'
  `;
  revalidatePath("/admin/outcomes");
  revalidatePath("/board");
  return { ok: points > 0 ? `${points} pts awarded.` : "Award cleared." };
}
