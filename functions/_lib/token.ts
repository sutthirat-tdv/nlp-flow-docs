/**
 * Stateless, signed tokens for the auth gate — no database. A token is
 * `base64url(payload) + "." + base64url(HMAC-SHA256 signature)`. The secret
 * never leaves the Pages Function; the browser only ever holds the opaque
 * signed string, so it cannot forge or extend a token.
 *
 * This buys "reasonably hard to bypass casually", not airtight security: a
 * verify-purpose token is a single-use *intent* in principle but nothing
 * stops replay within its 15 minute window (no nonce store), and a stolen
 * session token is valid until it expires or the secret rotates. Acceptable
 * for gating an internal docs site; do not reuse this for anything handling
 * real user data.
 */
export interface TokenPayload {
  email: string;
  purpose: "verify" | "session";
  iat: number;
  exp: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): Uint8Array {
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signToken(
  payload: TokenPayload,
  secret: string,
): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  return `${body}.${toBase64Url(signature)}`;
}

/** Returns the payload only if the signature is valid, unexpired, and of the expected purpose. */
export async function verifyToken(
  token: string,
  secret: string,
  expectPurpose: TokenPayload["purpose"],
): Promise<TokenPayload | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const key = await hmacKey(secret);
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = fromBase64Url(signature);
  } catch {
    return null;
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(body),
  );
  if (!valid) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
  } catch {
    return null;
  }
  if (payload.purpose !== expectPurpose) return null;
  if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) {
    return null;
  }
  return payload;
}
