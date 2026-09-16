/**
 * Cloudflare Pages env bindings for the auth functions. Set these as
 * encrypted secrets in the Pages project (dashboard → Settings →
 * Environment variables), never committed. See .dev.vars.example for local
 * `wrangler pages dev` testing.
 */
export interface Env {
  /** HMAC signing key for magic-link and session tokens. Long, random, secret. */
  AUTH_TOKEN_SECRET: string;
  /** Resend API key (https://resend.com) used to send the sign-in email. */
  RESEND_API_KEY: string;
  /** Verified sender address in Resend, e.g. "NLP Loyalty Docs <docs@terradigitalventures.com>". */
  MAIL_FROM: string;
  /** Only email addresses on this domain may sign in. Defaults to terradigitalventures.com. */
  ALLOWED_EMAIL_DOMAIN?: string;
  /** Public origin the sign-in link points back at, e.g. "https://docs.terradigitalventures.com". */
  SITE_URL: string;
}
