"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getActiveSeason } from "@/lib/data";
import {
  hashPin,
  isLockedOut,
  isValidPinFormat,
  isWeakPin,
  minutesRemaining,
  nextFailureState,
  endEntrantSession,
  startEntrantSession,
  verifyPin,
  ATTEMPTS_BEFORE_LOCKOUT,
  PIN_LENGTH,
} from "@/lib/entrant-auth";

export type JoinState = { error?: string; ok?: string };

type Row = {
  id: number;
  season_id: number;
  display_name: string;
  pin_hash: string | null;
  claimed_at: Date | null;
  pin_failures: number;
  pin_locked_until: Date | null;
};

async function loadEntrant(id: number, seasonId: number): Promise<Row | null> {
  const rows = await sql<Row[]>`
    select id, season_id, display_name, pin_hash, claimed_at,
           pin_failures, pin_locked_until
    from entrants where id = ${id} and season_id = ${seasonId}
  `;
  return rows[0] ?? null;
}

/**
 * Claims a pre-created name and sets its PIN. First come, first served — the
 * claim is guarded by a conditional UPDATE, so two people tapping the same name
 * at the same moment cannot both win.
 */
export async function claimName(
  _prev: JoinState,
  form: FormData
): Promise<JoinState> {
  const season = await getActiveSeason();
  if (!season) return { error: "No active season." };

  const id = Number(form.get("entrant_id"));
  if (!Number.isInteger(id)) return { error: "Pick your name from the list." };

  const pin = String(form.get("pin") ?? "").trim();
  const confirm = String(form.get("pin_confirm") ?? "").trim();

  if (!isValidPinFormat(pin)) {
    return { error: `Your PIN must be exactly ${PIN_LENGTH} digits.` };
  }
  if (pin !== confirm) return { error: "The two PINs don't match." };
  if (isWeakPin(pin)) {
    return { error: "Pick something less guessable than that." };
  }

  const entrant = await loadEntrant(id, season.id);
  if (!entrant) return { error: "That name isn't in this season." };
  if (entrant.claimed_at) {
    return {
      error: `${entrant.display_name} is already taken. If that's you, sign in with your PIN instead.`,
    };
  }

  const hash = await hashPin(pin);

  // Conditional on still being unclaimed — this is the race guard.
  const claimed = await sql<{ id: number }[]>`
    update entrants
    set pin_hash = ${hash}, claimed_at = now(), pin_failures = 0,
        pin_locked_until = null
    where id = ${entrant.id} and claimed_at is null
    returning id
  `;
  if (claimed.length === 0) {
    return { error: "Somebody just took that name. Pick another." };
  }

  await startEntrantSession(entrant.id);
  redirect("/picks");
}

/** Signs back in to an already-claimed name. */
export async function signIn(
  _prev: JoinState,
  form: FormData
): Promise<JoinState> {
  const season = await getActiveSeason();
  if (!season) return { error: "No active season." };

  const id = Number(form.get("entrant_id"));
  if (!Number.isInteger(id)) return { error: "Pick your name from the list." };

  const pin = String(form.get("pin") ?? "").trim();
  const entrant = await loadEntrant(id, season.id);
  if (!entrant) return { error: "That name isn't in this season." };

  if (isLockedOut(entrant.pin_locked_until)) {
    return {
      error: `Too many wrong PINs. Try again in ${minutesRemaining(
        entrant.pin_locked_until
      )} minutes, or ask the admin to reset it.`,
    };
  }

  if (!entrant.pin_hash) {
    return {
      error: `${entrant.display_name} hasn't set a PIN yet. Use "I'm new here" to claim it.`,
    };
  }

  if (!isValidPinFormat(pin) || !(await verifyPin(pin, entrant.pin_hash))) {
    const next = nextFailureState(entrant.pin_failures);
    await sql`
      update entrants
      set pin_failures = ${next.failures}, pin_locked_until = ${next.lockedUntil}
      where id = ${entrant.id}
    `;
    if (next.lockedUntil) {
      return {
        error: `Wrong PIN. That's ${ATTEMPTS_BEFORE_LOCKOUT} — locked for 15 minutes.`,
      };
    }
    const left = ATTEMPTS_BEFORE_LOCKOUT - next.failures;
    return { error: `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.` };
  }

  await sql`
    update entrants set pin_failures = 0, pin_locked_until = null
    where id = ${entrant.id}
  `;
  await startEntrantSession(entrant.id);
  redirect("/picks");
}

export async function signOut(): Promise<void> {
  await endEntrantSession();
  redirect("/join");
}
