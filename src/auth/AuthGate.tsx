import { FormEvent, ReactNode, useState } from "react";

import { AuthContext } from "./AuthContext";
import {
  ALLOWED_EMAIL_DOMAIN,
  clearSession,
  isAllowedEmail,
  readSession,
  writeSession,
} from "./session";

/**
 * Gates the app behind a domain check on a typed email address — no
 * verification email, no server, no secret. This is a UX speed bump against
 * casual access (wrong link shared, accidental open), not access control:
 * anyone can satisfy it with any string ending in @terradigitalventures.com,
 * whether or not they control that mailbox. Because there's no backend
 * dependency, the built site is a plain static bundle again — deployable
 * anywhere, same as before this gate existed.
 */
export function AuthGate({ children }: { children: (email: string) => ReactNode }) {
  const [email, setEmail] = useState(() => readSession()?.email ?? null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (email) {
    return (
      <AuthContext.Provider
        value={{
          email,
          signOut: () => {
            clearSession();
            setEmail(null);
          },
        }}
      >
        {children(email)}
      </AuthContext.Provider>
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim().toLowerCase();
    if (!isAllowedEmail(trimmed)) {
      setError(`Only @${ALLOWED_EMAIL_DOMAIN} email addresses can access this site.`);
      return;
    }
    writeSession(trimmed);
    setEmail(trimmed);
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
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <button className="auth-gate__submit" type="submit">
            Continue
          </button>
        </form>
        {error ? <p className="auth-gate__error">{error}</p> : null}
      </div>
    </div>
  );
}
