import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { AuthContext } from "./AuthContext";
import {
  ALLOWED_EMAIL_DOMAIN,
  clearSession,
  exchangeVerifyToken,
  needsRevalidation,
  readSession,
  requestVerificationEmail,
  revalidateSession,
} from "./session";

type Status =
  | { kind: "checking" }
  | { kind: "verifying" }
  | { kind: "signed-out" }
  | { kind: "sent"; email: string }
  | { kind: "signed-in"; email: string };

/**
 * Gates the whole app behind a corporate-email magic link. This protects the
 * app shell and UX, not the raw static files — anyone who can read the built
 * JS/JSON directly from wherever dist/ is hosted can still fetch them. Real
 * protection for that would be Cloudflare Access in front of the Pages
 * project; this is a deliberately lighter speed bump, not a substitute.
 */
const DEV_EMAIL = `dev@${ALLOWED_EMAIL_DOMAIN}`;

export function AuthGate({ children }: { children: (email: string) => ReactNode }) {
  // `import.meta.env.DEV` is statically false in a production `vite build` —
  // this branch (and the gate below) is dead code in dist/, not a runtime
  // toggle. Plain `npm run dev` doesn't run the Cloudflare Pages Functions
  // under functions/, so /api/auth/* is never reachable there; without this
  // bypass nobody could develop locally at all. Use `npm run pages:dev`
  // (after `npm run build`) to exercise the real gate end to end.
  if (import.meta.env.DEV) {
    return (
      <AuthContext.Provider value={{ email: DEV_EMAIL, signOut: () => {} }}>
        {children(DEV_EMAIL)}
      </AuthContext.Provider>
    );
  }
  return <AuthGateLive>{children}</AuthGateLive>;
}

function AuthGateLive({ children }: { children: (email: string) => ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isVerifyRoute = location.pathname === "/verify";
  const verifyToken = params.get("token");

  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      if (isVerifyRoute) {
        if (!verifyToken) {
          if (!active) return;
          setError("Missing sign-in token.");
          setStatus({ kind: "signed-out" });
          navigate("/", { replace: true });
          return;
        }
        setStatus({ kind: "verifying" });
        const result = await exchangeVerifyToken(verifyToken);
        if (!active) return;
        if (!result.ok) {
          setError(result.error);
          setStatus({ kind: "signed-out" });
          navigate("/", { replace: true });
          return;
        }
        setStatus({ kind: "signed-in", email: result.email });
        navigate("/", { replace: true });
        return;
      }

      const session = readSession();
      if (!session) {
        if (active) setStatus({ kind: "signed-out" });
        return;
      }
      if (!needsRevalidation(session)) {
        if (active) setStatus({ kind: "signed-in", email: session.email });
        return;
      }
      const valid = await revalidateSession(session);
      if (!active) return;
      if (valid) setStatus({ kind: "signed-in", email: session.email });
      else {
        clearSession();
        setStatus({ kind: "signed-out" });
      }
    })();

    return () => {
      active = false;
    };
  }, [isVerifyRoute, verifyToken, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      setError(`Only @${ALLOWED_EMAIL_DOMAIN} email addresses can access this site.`);
      return;
    }
    setSubmitting(true);
    const result = await requestVerificationEmail(trimmed);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus({ kind: "sent", email: trimmed });
  }

  if (status.kind === "signed-in") {
    return (
      <AuthContext.Provider
        value={{
          email: status.email,
          signOut: () => {
            clearSession();
            setStatus({ kind: "signed-out" });
          },
        }}
      >
        {children(status.email)}
      </AuthContext.Provider>
    );
  }

  if (status.kind === "checking" || status.kind === "verifying") {
    return (
      <div className="boot">
        <div className="boot__spinner" />
        <p>{status.kind === "verifying" ? "Verifying your sign-in link…" : "Checking your session…"}</p>
      </div>
    );
  }

  if (status.kind === "sent") {
    return (
      <div className="auth-gate">
        <div className="auth-gate__card">
          <div className="auth-gate__brand">NLP Loyalty Platform</div>
          <h1>Check your email</h1>
          <p className="dim">
            Sent a sign-in link to <strong>{status.email}</strong>. It expires in 15
            minutes.
          </p>
          <button
            type="button"
            className="expander"
            onClick={() => setStatus({ kind: "signed-out" })}
          >
            use a different address
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-gate">
      <div className="auth-gate__card">
        <div className="auth-gate__brand">NLP Loyalty Platform</div>
        <h1>Sign in</h1>
        <p className="dim">
          Flow, use-case and schema docs for the loyalty platform. Restricted to{" "}
          <span className="mono">@{ALLOWED_EMAIL_DOMAIN}</span> addresses.
        </p>
        <form className="auth-gate__form" onSubmit={handleSubmit}>
          <input
            className="input input--grow"
            type="email"
            inputMode="email"
            placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <button className="auth-gate__submit" type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send sign-in link"}
          </button>
        </form>
        {error ? <p className="auth-gate__error">{error}</p> : null}
      </div>
    </div>
  );
}
