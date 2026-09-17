/**
 * Client side of the auth gate. There is no verification step — this only
 * checks that the typed address ends with @terradigitalventures.com and
 * remembers it in localStorage. It does NOT prove the person typing it
 * controls that mailbox: anyone who reads this file (or just opens devtools)
 * can see the check and satisfy it with any string ending in the right
 * domain. Treat this as a UX speed bump against casual/accidental access,
 * not as access control for anything sensitive.
 */
export const ALLOWED_EMAIL_DOMAIN = "terradigitalventures.com";

const STORAGE_KEY = "nlp-flow-docs:session";

interface StoredSession {
  email: string;
}

export function isAllowedEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

export function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.email || !isAllowedEmail(parsed.email)) return null;
    return { email: parsed.email };
  } catch {
    return null;
  }
}

export function writeSession(email: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ email } satisfies StoredSession));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export type { StoredSession };
