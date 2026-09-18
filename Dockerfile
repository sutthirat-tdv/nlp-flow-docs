# Builds this docs site AND generates its data in one reproducible step,
# baked into the image — so "someone manually uploaded dist/ and forgot the
# data/ subfolder" (the exact incident this Dockerfile exists to prevent)
# becomes impossible: there is no manual copy step at all.
#
# IMPORTANT — build context is the PARENT directory, not this one:
#
#   cd corp-ais/            # the directory that contains nlp-flow-docs/
#                            # AND every sibling checkout, side by side
#   docker build -f nlp-flow-docs/Dockerfile -t nlp-flow-docs .
#   docker run --rm -p 8080:80 nlp-flow-docs
#   # open http://localhost:8080
#
# Why: the extractor reads each service via a *relative sibling path*
# (repos.config.json's "localPath": "../nlp-openapi-bff", etc. — see
# extractor/config.ts's repoSourcePath()). That only resolves correctly if
# nlp-flow-docs/ and every sibling repo are copied into the image in the
# same side-by-side layout they have on disk today. Building with this repo
# alone as context cannot work — the siblings simply wouldn't be there.
#
# This generates OFFLINE (git archive against whatever origin/sit each
# sibling already has fetched locally at build time — the exact same thing
# `npm run generate:offline` does), so the build needs no GitHub credentials.
# Pass --build-arg FETCH=1 to `git fetch` each sibling's branch first instead,
# but that requires network access AND authentication (SSH agent forwarding
# or a token) to the private corp-ais org from inside the build, which this
# Dockerfile does not set up — decide and wire that up deliberately if you
# want it, don't assume it works as-is.

FROM node:20-slim AS build

# git: extractor/sync.ts shells out to `git archive` / `git log` on each
# sibling checkout. tar: sync.ts extracts that archive with the system tar.
RUN apt-get update && apt-get install -y --no-install-recommends git tar \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Sibling service repos, copied in the same layout repos.config.json expects.
# git archive needs each one's real .git history, not just a working tree —
# see corp-ais/.dockerignore for what's excluded from this (node_modules,
# build output, etc. — never .git).
COPY nlp-openapi-bff/ ./nlp-openapi-bff/
COPY nlp-backoffice-bff/ ./nlp-backoffice-bff/
COPY esb-loyalty-management-agg-common/ ./esb-loyalty-management-agg-common/
COPY esb-dos-TMF658-loyalty-management-nlp/ ./esb-dos-TMF658-loyalty-management-nlp/
COPY nlp-cronjob/ ./nlp-cronjob/

WORKDIR /workspace/nlp-flow-docs

# Install deps from the lockfile before copying the rest of the source, so
# `npm ci` only reruns when package.json/package-lock.json actually change.
COPY nlp-flow-docs/package.json nlp-flow-docs/package-lock.json ./
RUN npm ci

COPY nlp-flow-docs/ ./

ARG FETCH=
RUN if [ -n "$FETCH" ]; then npm run generate; else npm run generate:offline; fi
RUN npm run build

# ---------------------------------------------------------------- serve
# Hash routing (see main.tsx) means every client-side route lives after a
# `#`, so a plain static file server is enough — no SPA-fallback rewrite
# rules needed, unlike a browser-history-router app.
#
# nginx-unprivileged: the official nginx:alpine image's master process runs
# as root (needed to bind port 80); this is the same nginx built to run
# entirely as a non-root user instead, listening on 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS serve

COPY --from=build /workspace/nlp-flow-docs/dist /usr/share/nginx/html

# Fails the container health check the same way this incident actually
# surfaced — a 404 on the generated data — rather than just checking that
# nginx itself is up.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/data/core.json || exit 1

EXPOSE 8080
