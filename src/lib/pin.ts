/**
 * PIN rules with no Node dependencies, so the join form (a client component)
 * can share them with the server without dragging node:crypto into the browser
 * bundle. Hashing and sessions live in entrant-auth.ts, server-only.
 */
export const PIN_LENGTH = 4;

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin);
}

/** Obvious PINs are worth refusing when the join link is shared around. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true; // 0000, 1111
  return ["1234", "4321", "0123", "1212"].includes(pin);
}
