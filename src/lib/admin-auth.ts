import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "pl_admin";
const TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "ADMIN_SESSION_SECRET is not set (needs at least 16 characters)."
    );
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Constant-time string compare that doesn't leak length via throw. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still burn a comparison so timing doesn't differ on length mismatch.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function checkPassphrase(input: string): boolean {
  const expected = process.env.ADMIN_PASSPHRASE;
  if (!expected) {
    throw new Error("ADMIN_PASSPHRASE is not set.");
  }
  return safeEqual(input, expected);
}

export async function startAdminSession(): Promise<void> {
  const exp = String(Date.now() + TTL_MS);
  const nonce = randomBytes(8).toString("base64url");
  const payload = `${exp}.${nonce}`;
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function endAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** True only for a valid, unexpired, correctly signed admin cookie. */
export async function isAdmin(): Promise<boolean> {
  try {
    const jar = await cookies();
    const raw = jar.get(COOKIE)?.value;
    if (!raw) return false;
    const parts = raw.split(".");
    if (parts.length !== 3) return false;
    const [exp, nonce, sig] = parts;
    if (!safeEqual(sig, sign(`${exp}.${nonce}`))) return false;
    return Number(exp) > Date.now();
  } catch {
    return false;
  }
}

/** Throws unless the caller is admin. Every admin action calls this first. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Not authorised.");
}
