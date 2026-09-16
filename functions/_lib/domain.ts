const DEFAULT_ALLOWED_DOMAIN = "terradigitalventures.com";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isWellFormedEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function isAllowedDomain(email: string, allowedDomain?: string): boolean {
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain === (allowedDomain || DEFAULT_ALLOWED_DOMAIN).trim().toLowerCase();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export { DEFAULT_ALLOWED_DOMAIN };
