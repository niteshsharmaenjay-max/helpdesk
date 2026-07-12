# Build context is the repo root (see docker-compose.yml) because this is a
# Bun workspace: installing from server/ alone can't resolve the workspace
# link back to the root lockfile.
#
# Note on the Prisma CLI: `bun install`'s postinstall does NOT run
# `prisma generate` here (Bun only runs lifecycle scripts for packages it
# trusts by default, and prisma/@prisma/client aren't on that list), so
# generation is done explicitly below. Locally on the host this repo is
# developed in, every `prisma` subcommand crashes with `ERR_REQUIRE_ESM`
# because the CLI re-execs into the host's real (older) Node.js binary,
# which lacks synchronous require(esm) support that one of its
# dependencies needs. Inside this image there is no real Node binary at
# all — `node` is a symlink to `bun` itself — so the CLI runs under Bun's
# own module loader instead and works correctly; confirmed by running
# `prisma generate` and `prisma migrate deploy` directly in this image
# against a real Postgres container.
FROM oven/bun:1 AS base
WORKDIR /app

# Dependency layer: only the manifests + the Prisma schema (needed for
# codegen), so source-only edits don't bust the install cache.
COPY package.json bun.lock ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY server/prisma ./server/prisma
COPY server/prisma.config.ts ./server/prisma.config.ts
RUN bun install --frozen-lockfile

# prisma.config.ts resolves DATABASE_URL/SHADOW_DATABASE_URL eagerly even
# for `generate` (which doesn't touch a live DB) — placeholders satisfy
# that at build time; docker-compose sets the real values at container
# start, well before `migrate deploy`/the server itself run.
RUN cd server && \
    DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder" \
    SHADOW_DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder" \
    bunx prisma generate

COPY server ./server

WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 3000

# `prisma generate` also re-runs here, not just at build time above: some
# platforms (observed on Railway) don't reliably carry build-time RUN output
# through to the deployed container — the generated client can end up
# missing at runtime even though the build step reported success. Running
# it again at start is cheap (~150ms) and makes startup self-contained
# regardless of what the build cache did. Migrations/seeding (idempotent,
# see prisma/seed.ts) then run against the real, now-reachable database.
CMD ["sh", "-c", "bunx prisma generate && bunx prisma migrate deploy && bun prisma/seed.ts && bun src/index.ts"]
