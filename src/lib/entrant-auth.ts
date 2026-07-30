import {
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { PIN_LENGTH } from "./pin";

export { PIN_LENGTH, isValidPinFormat, isWeakPin } from "./pin";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

const COOKIE = "pl_entrant";
const TTL_MS = 1000 * 60 * 60 * 24 * 120; // through to the end of the season

const MAX_FAILURES = 5;
export const LOCKOUT_MINUTES = 15;

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "ADMIN_SESSION_SECRET is not set (needs at least 16 characters)."
    );
  }
  return s;
}

/**
 * Signs with a purpose prefix so an entrant cookie can never be replayed as an
 * admin cookie, or vice versa, even though both derive from the same secret.
 */
function sign(payload: string): string {
  return createHmac("sha256", secret())
    .update(`entrant:${payload}`)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------- PINs

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(pin, salt, 64);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  const key = await scrypt(pin, salt, 64);
  return safeEqual(key.toString("hex"), expected);
}

// ------------------------------------------------------------- sessions

export async function startEntrantSession(entrantId: number): Promise<void> {
  const exp = String(Date.now() + TTL_MS);
  const nonce = randomBytes(8).toString("base64url");
  const payload = `${entrantId}.${exp}.${nonce}`;
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function endEntrantSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * The signed-in entrant's id, or null. This is the only thing that identifies
 * an entrant now — there is no token in the URL to copy or forward, so a
 * shared join link cannot be used to read someone else's picks.
 */
export async function getSessionEntrantId(): Promise<number | null> {
  try {
    const jar = await cookies();
    const raw = jar.get(COOKIE)?.value;
    if (!raw) return null;
    const parts = raw.split(".");
    if (parts.length !== 4) return null;
    const [id, exp, nonce, sig] = parts;
    if (!safeEqual(sig, sign(`${id}.${exp}.${nonce}`))) return null;
    if (Number(exp) <= Date.now()) return null;
    const entrantId = Number(id);
    return Number.isInteger(entrantId) ? entrantId : null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------- lockout

export function isLockedOut(lockedUntil: Date | null): boolean {
  return lockedUntil !== null && new Date(lockedUntil).getTime() > Date.now();
}

export function minutesRemaining(lockedUntil: Date | null): number {
  if (!lockedUntil) return 0;
  const ms = new Date(lockedUntil).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 60000));
}

/** Next failure count and lockout, given the current count. */
export function nextFailureState(current: number): {
  failures: number;
  lockedUntil: Date | null;
} {
  const failures = current + 1;
  if (failures >= MAX_FAILURES) {
    return {
      failures: 0, // reset the counter; the lockout is the punishment
      lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
    };
  }
  return { failures, lockedUntil: null };
}

export const ATTEMPTS_BEFORE_LOCKOUT = MAX_FAILURES;
