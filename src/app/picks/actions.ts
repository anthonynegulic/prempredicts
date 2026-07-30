"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { getActiveSeason, getEntrantById, getQuestions, isLocked } from "@/lib/data";
import { getSessionEntrantId } from "@/lib/entrant-auth";
import { validateEntry, type FieldError, type PickInput } from "@/lib/validate";

export type SaveResult =
  | { ok: true; savedAt: string; warnings: string[] }
  | { ok: false; message: string; errors?: FieldError[] };

/**
 * Saves the signed-in entrant's picks.
 *
 * The entrant_id comes from the signed session cookie, never from an argument,
 * so no client can name a different entrant to write to. The lock is re-checked
 * here rather than trusted from the UI.
 */
export async function savePicks(input: PickInput[]): Promise<SaveResult> {
  const entrantId = await getSessionEntrantId();
  if (!entrantId) {
    return { ok: false, message: "You're signed out. Reload and sign in again." };
  }

  const entrant = await getEntrantById(entrantId);
  if (!entrant) return { ok: false, message: "That entrant no longer exists." };

  const season = await getActiveSeason();
  if (!season || season.id !== entrant.season_id) {
    return { ok: false, message: "No active season." };
  }
  if (isLocked(season)) {
    return {
      ok: false,
      message: "Picks locked 21 August. Nothing more can be changed.",
    };
  }

  const questions = await getQuestions(season.id);
  const shapes = questions.map((q) => ({
    key: q.key,
    inputType: q.input_type,
    slotCount: q.slot_count,
    label: q.label,
  }));

  // Ignore anything the client sent that isn't a real slot of a real question.
  const byKey = new Map(questions.map((q) => [q.key, q]));
  const clean: PickInput[] = [];
  for (const p of input) {
    const q = byKey.get(p.questionKey);
    if (!q) continue;
    if (!Number.isInteger(p.slotIndex)) continue;
    if (p.slotIndex < 0 || p.slotIndex >= q.slot_count) continue;
    clean.push({
      questionKey: p.questionKey,
      slotIndex: p.slotIndex,
      value: String(p.value ?? "").slice(0, 200),
    });
  }

  const { errors, warnings } = validateEntry(shapes, clean);
  if (errors.length > 0) {
    return { ok: false, message: "Some picks contradict each other.", errors };
  }

  await sql.begin(async (tx) => {
    for (const p of clean) {
      const q = byKey.get(p.questionKey)!;
      const raw = p.value.trim();
      const value = raw === "" ? null : raw;
      const club = q.input_type === "free_text" ? null : value;

      await tx`
        insert into picks
          (season_id, entrant_id, question_id, slot_index, raw_value, canonical_club)
        values (${season.id}, ${entrant.id}, ${q.id}, ${p.slotIndex}, ${value}, ${club})
        on conflict (entrant_id, question_id, slot_index) do update set
          raw_value      = excluded.raw_value,
          canonical_club = excluded.canonical_club,
          updated_at     = now()
      `;
    }
  });

  revalidatePath("/picks");
  return { ok: true, savedAt: new Date().toISOString(), warnings };
}
