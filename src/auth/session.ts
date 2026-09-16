/**
 * Client side of the auth gate. The session token itself is opaque here —
 * it's an HMAC-signed string only the Pages Function's secret can verify, so
 * the browser cannot forge or extend it (see functions/_lib/token.ts). This
 * module only stores it and asks the server whether it's still good.
 */
export const ALLOWED_EMAIL_DOMAIN = "terradigitalventures.com";

const STORAGE_KEY = "nlp-flow-docs:session";
/** How long a cached session is trusted before re-checking with the server. */
const REVALIDATE_AFTER_MS = 60 * 60 * 1000;

interface StoredSession {
  token: string;
  email: string;
  validatedAt: number;
}

export function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.token || !parsed.email || !parsed.validatedAt) return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

function writeSession(token: string, email: string) {
  const session: StoredSession = { token, email, validatedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function needsRevalidation(session: StoredSession): boolean {
  return Date.now() - session.validatedAt > REVALIDATE_AFTER_MS;
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const UNREACHABLE_ERROR =
  "Could not reach the sign-in service. This page needs to be deployed on Cloudflare Pages for /api/auth/* to exist.";

export async function requestVerificationEmail(email: string): Promise<Result<{}>> {
  try {
    const res = await fetch("/api/auth/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}) as { error?: string });
    if (!res.ok) return { ok: false, error: data.error || "Could not send the verification email." };
    return { ok: true };
  } catch {
    return { ok: false, error: UNREACHABLE_ERROR };
  }
}

export async function exchangeVerifyToken(
  token: string,
): Promise<Result<{ email: string }>> {
  try {
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res
      .json()
      .catch(() => ({}) as { sessionToken?: string; email?: string; error?: string });
    if (!res.ok || !data.sessionToken || !data.email) {
      return { ok: false, error: data.error || "This link is invalid or has expired." };
    }
    writeSession(data.sessionToken, data.email);
    return { ok: true, email: data.email };
  } catch {
    return { ok: false, error: UNREACHABLE_ERROR };
  }
}

/**
 * Re-checks a cached session with the server. On a network failure (not a
 * rejection — an actual unreachable endpoint) this trusts the local cache
 * rather than locking a reader out over a blip; a rejected/expired token
 * still fails closed.
 */
export async function revalidateSession(session: StoredSession): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: session.token }),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({ valid: false }));
    if (data.valid) writeSession(session.token, session.email);
    return !!data.valid;
  } catch {
    return true;
  }
}

export type { StoredSession };
