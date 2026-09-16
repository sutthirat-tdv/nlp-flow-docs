/**
 * POST /api/auth/session { token } — the client re-validates its cached
 * session against this endpoint periodically (see src/auth/session.ts)
 * rather than trusting localStorage forever, so a revoked secret or an
 * expired session actually locks a reader out.
 */
import { isAllowedDomain } from "../../_lib/domain";
import type { Env } from "../../_lib/env";
import { json, readJsonBody } from "../../_lib/http";
import { verifyToken } from "../../_lib/token";

interface RequestBody {
  token?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJsonBody<RequestBody>(request);
  if (!body) return json({ valid: false }, 400);

  const payload = await verifyToken(body.token ?? "", env.AUTH_TOKEN_SECRET, "session");
  if (!payload || !isAllowedDomain(payload.email, env.ALLOWED_EMAIL_DOMAIN)) {
    return json({ valid: false }, 401);
  }

  return json({ valid: true, email: payload.email });
};
