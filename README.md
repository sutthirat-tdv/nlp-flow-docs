# NLP Loyalty — flow, use-case and schema docs

Generated documentation site for the NestJS services on `origin/sit` listed in `repos.config.json`. Nothing in the catalogs is hand-written. The durable spec is [`REQUIREMENTS.md`](./REQUIREMENTS.md) — give that to the next agent (or human) who continues this work.

Generated catalogs (`public/data/*.json`), snapshots (`.cache/`), `node_modules/`, and build output (`dist/`, `dist-extractor/`) are gitignored. After clone, run generate before `npm run dev`.

## First run

From this directory, with the service repos checked out as siblings (`../nlp-openapi-bff`, `../nlp-backoffice-bff`, `../esb-loyalty-management-agg-common`, `../esb-dos-TMF658-loyalty-management-nlp`, `../nlp-cronjob`):

```bash
npm install
npm run generate:offline   # uses local origin/sit; no GitHub
npm run dev                # http://localhost:4173
```

To fetch latest `origin/sit` then rebuild the static site:

```bash
npm run update
```

## Point at a release tag or commit

Edit `repos.config.json` — set that repo's `branch` to a tag (`"2.31.0"`) or a SHA — then `npm run update`. The **Versions & updates** page lists recent tags per repo.

## New joiners

Open **New joiner guide** in the sidebar. The one idea: every cross-service call is a Kafka message; BFFs translate HTTP; the TMF658 service owns loyalty data. **Mongo collections** is a database diagram of each collection as `db.collection()` creates it, with columns, PK/FK, and which use cases insert vs query. **HTTP dependencies** lists every axios call (D03, SAP, PNS, …) a use case actually makes.

## What each command does

| Command                    | Purpose                                           |
| -------------------------- | ------------------------------------------------- |
| `npm run generate`         | `git fetch` + snapshot + extract → `public/data/` |
| `npm run generate:offline` | snapshot local refs only                          |
| `npm run extract`          | re-extract without re-snapshotting                |
| `npm run dev`              | Vite dev server                                   |
| `npm run build`            | static site in `dist/`                            |
| `npm run update`           | generate + build                                  |
| `npm run pages:dev`        | serve `dist/` + `functions/` together via Wrangler, for testing the real sign-in gate locally |

## Access

The site is gated behind a sign-in-by-email-link screen (`src/auth/`), restricted to `@terradigitalventures.com` addresses. There's no user database — a Cloudflare Pages Function (`functions/api/auth/*`) mints a short-lived, HMAC-signed magic link, emails it via [Resend](https://resend.com), and exchanges it for a longer-lived signed session token the browser holds in `localStorage`. See the comments in `functions/_lib/token.ts` and `src/auth/AuthGate.tsx` for exactly what this does and does not protect — short version: it stops casual access to the app, it does not cryptographically restrict direct requests to the files under `dist/assets/` or `public/data/` once they're hosted somewhere reachable. For that, put the Cloudflare Pages project behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) instead/as well.

**This only works when deployed to Cloudflare Pages** — the `functions/` directory needs Pages' Functions runtime; a plain S3/Netlify/file-share static deploy would serve `dist/` fine but `/api/auth/*` would 404. `npm run dev` (plain Vite) skips the gate entirely in development — see the `import.meta.env.DEV` branch in `AuthGate.tsx` — so local iteration isn't blocked on any of this; that branch is compiled out of `npm run build`'s output.

**One-time setup, done by whoever owns the Cloudflare account:**

1. Create the Pages project, connect this repo, build command `npm run generate:offline && npm run build` (or push pre-built `dist/` — the extractor needs the four/five service repos as sibling checkouts, which Cloudflare's build environment won't have; pre-building and deploying `dist/` + `functions/` from CI is likely simpler than building on Cloudflare).
2. In the Pages project settings → environment variables, set `SITE_URL` (the public URL) and optionally `ALLOWED_EMAIL_DOMAIN` (defaults to `terradigitalventures.com`).
3. Set the two secrets — `npx wrangler pages secret put AUTH_TOKEN_SECRET` (a long random string, e.g. `openssl rand -base64 48`) and `npx wrangler pages secret put RESEND_API_KEY` (from a Resend account with a verified sending domain), and set `MAIL_FROM` to a verified sender on that domain.
4. To test locally first: `cp .dev.vars.example .dev.vars`, fill in real values, `npm run build && npm run pages:dev`.
