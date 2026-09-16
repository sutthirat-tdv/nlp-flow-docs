/**
 * POST /api/auth/verify { token } — exchanges a short-lived magic-link token
 * for a longer-lived session token. The domain is re-checked here too, so a
 * token minted before an allow-list change can't outlive that change.
 */
import { isAllowedDomain } from "../../_lib/domain";
import type { Env } from "../../_lib/env";
import { json, readJsonBody } from "../../_lib/http";
import { signToken, verifyToken } from "../../_lib/token";

interface RequestBody {
  token?: string;
}

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJsonBody<RequestBody>(request);
  if (!body) return json({ error: "Invalid request body." }, 400);

  const payload = await verifyToken(body.token ?? "", env.AUTH_TOKEN_SECRET, "verify");
  if (!payload || !isAllowedDomain(payload.email, env.ALLOWED_EMAIL_DOMAIN)) {
    return json(
      { error: "This link is invalid or has expired. Request a new one." },
      401,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionToken = await signToken(
    { email: payload.email, purpose: "session", iat: now, exp: now + SESSION_TTL_SECONDS },
    env.AUTH_TOKEN_SECRET,
  );

  return json({ sessionToken, email: payload.email });
};
