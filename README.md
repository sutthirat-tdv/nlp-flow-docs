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

## Docker (build + generate + serve in one step)

Solves the "someone built locally and forgot to upload the `data/` subfolder" class of deploy failure by never having a manual copy step at all — the image bakes in generated data at build time.

**Build context is the *parent* of this directory** (the one containing `nlp-flow-docs/` and every sibling service checkout), not this directory itself — the extractor reads each service via a relative sibling path (`repos.config.json`'s `localPath`), so the build needs them all copied in side by side:

```bash
cd ..    # the directory that contains nlp-flow-docs/ and every sibling repo
docker build -f nlp-flow-docs/Dockerfile -t nlp-flow-docs .
docker run --rm -p 8080:8080 nlp-flow-docs
# open http://localhost:8080
```

Generates offline (`npm run generate:offline` — whatever `origin/sit` each sibling already has fetched locally, same as running it by hand) so the build needs no GitHub credentials. Pass `--build-arg FETCH=1` to fetch latest `origin/sit` during the build instead — that needs network + auth to the private repos from inside the build, which isn't wired up here; set that up deliberately if you want it. See the comments at the top of `Dockerfile` for the full reasoning, including why this can't be built from inside `nlp-flow-docs/` alone.

## Vercel

**Do not use Vercel's normal git-integration auto-deploy for this project** (push to a connected branch → Vercel builds in its own cloud environment). That environment only clones this one repository — it has no sibling checkouts, so `npm run generate`/`generate:offline` cannot run there. `vercel.json` sets `buildCommand: "npm run update"` specifically so that if Vercel's own build *does* run, it fails loudly (missing repo error) instead of silently shipping a site with no `data/` — which is what happened before this file existed: the auto-detected build was a bare `vite build`, succeeded trivially, and shipped `dist/` with an empty `data/` (the exact "Documentation data is missing" 404 this section exists to prevent). Turn off auto-deploy in the Vercel project's Git settings once this is in place, or every push will show a failed build.

Instead, build where the sibling repos actually are (your machine, or any CI runner that checks them out), then push the finished artifact — Vercel never touches source:

```bash
npx vercel login                 # once, your Vercel account
npx vercel link                  # once, links this directory to a Vercel project
npx vercel pull --yes --environment=production
npx vercel build --prod          # runs buildCommand locally, where the siblings exist
npx vercel deploy --prebuilt --prod   # uploads the already-built .vercel/output — no remote build
```

`vercel build` and `vercel deploy --prebuilt` are two different steps on purpose: the first must run somewhere with the sibling repos (this directory, right now, via the same `npm run update` the Docker/local flows use); the second only uploads what the first already produced and needs no source access at all.

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

## Access

The site is gated behind a sign-in screen (`src/auth/`) that only checks the typed email address ends with `@terradigitalventures.com`, then remembers it in `localStorage`. That's the entire mechanism — no verification email, no server, no secret.

**This is a UX speed bump, not access control.** Nothing proves the person typing an address controls that mailbox: anyone who opens devtools can read the check in `src/auth/session.ts` and satisfy it with any string ending in the right domain, whether or not it's theirs. Do not rely on this to protect anything sensitive, and do not present it to anyone as "verified" or "authenticated." Because it has no server dependency, the built site is a plain static bundle — deployable anywhere (S3, Netlify, a file share, `npm run dev`) exactly like before this gate existed.

If real access control is ever needed, an earlier design (email magic link via a Cloudflare Pages Function + Resend, HMAC-signed session tokens) is in git history around commit `22d36a4` before it was deliberately simplified to a domain-only check — or, generally preferable to building verification into the app, put the hosting target behind an identity-aware proxy (Cloudflare Access, an SSO-gated reverse proxy).
