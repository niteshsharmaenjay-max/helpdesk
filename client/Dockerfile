# Build context is the repo root (see docker-compose.yml) — same Bun
# workspace reasoning as server/Dockerfile. The client's build also needs
# the full server source: `client/src/lib/auth-client.ts` type-imports
# `server/src/lib/auth.ts` (Better Auth's `inferAdditionalFields`
# pattern), which itself needs the generated Prisma client's types to
# resolve — see server/Dockerfile for why `generate` is run explicitly.
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY server/prisma ./server/prisma
COPY server/prisma.config.ts ./server/prisma.config.ts
RUN bun install --frozen-lockfile
RUN cd server && \
    DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder" \
    SHADOW_DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder" \
    bunx prisma generate

COPY server ./server
COPY client ./client
WORKDIR /app/client
RUN bun run build

FROM nginx:alpine AS runtime
COPY client/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/client/dist /usr/share/nginx/html
# Default matches the docker-compose service name; override per-platform
# (see client/nginx.conf's comment) — e.g. on Railway, set this to the
# server service's private-networking address instead.
ENV SERVER_UPSTREAM=server:3000
# Default for platforms (docker-compose) that don't inject PORT themselves.
# Railway sets its own PORT at runtime and nginx.conf's template picks it up.
ENV PORT=80
EXPOSE 80
