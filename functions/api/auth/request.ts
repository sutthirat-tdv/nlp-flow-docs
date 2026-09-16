/**
 * POST /api/auth/request { email } — validates the email is well formed and
 * on the allowed corporate domain, mints a short-lived "verify" token, and
 * emails a magic link via Resend. Domain is re-checked here even though the
 * client also checks it — the client-side check is a UX nicety, this is the
 * one that matters.
 */
import { isAllowedDomain, isWellFormedEmail, normalizeEmail } from "../../_lib/domain";
import type { Env } from "../../_lib/env";
import { json, readJsonBody } from "../../_lib/http";
import { signToken } from "../../_lib/token";

interface RequestBody {
  email?: string;
}

const VERIFY_TTL_SECONDS = 15 * 60;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJsonBody<RequestBody>(request);
  if (!body) return json({ error: "Invalid request body." }, 400);

  const email = normalizeEmail(body.email ?? "");
  if (!isWellFormedEmail(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  const allowedDomain = env.ALLOWED_EMAIL_DOMAIN;
  if (!isAllowedDomain(email, allowedDomain)) {
    return json(
      {
        error: `Only @${allowedDomain || "terradigitalventures.com"} email addresses can access this site.`,
      },
      403,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const token = await signToken(
    { email, purpose: "verify", iat: now, exp: now + VERIFY_TTL_SECONDS },
    env.AUTH_TOKEN_SECRET,
  );

  const origin = env.SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  const link = `${origin}/#/verify?token=${encodeURIComponent(token)}`;

  const sent = await sendVerificationEmail(env, email, link);
  if (!sent) {
    return json(
      { error: "Could not send the verification email. Try again shortly." },
      502,
    );
  }

  return json({ ok: true });
};

async function sendVerificationEmail(
  env: Env,
  email: string,
  link: string,
): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [email],
      subject: "Sign in to the NLP Loyalty flow docs",
      text: `Sign in to the NLP Loyalty flow docs:\n\n${link}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`,
      html: `<p>Sign in to the NLP Loyalty flow docs:</p><p><a href="${link}">${link}</a></p><p style="color:#7180a0;font-size:12px">This link expires in 15 minutes. If you didn't request it, ignore this email.</p>`,
    }),
  });
  return res.ok;
}
