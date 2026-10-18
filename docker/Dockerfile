# docker/Dockerfile
# syntax=docker/dockerfile:1.7
#
# Multi-stage build. Debian-slim (glibc) base is deliberate: better-sqlite3
# is not used (the app runs on the built-in node:sqlite), but glibc avoids any
# musl surprises for native modules pulled in transitively.

ARG NODE_IMAGE=node:22.14.0-bookworm-slim

# ---------- shared base ----------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    CI=true
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

# ---------- deps: strict lockfile-only install ----------
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY contracts ./contracts
RUN pnpm fetch --ignore-scripts

# ---------- build ----------
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @skp/web build \
 && pnpm --filter @skp/server build \
 && pnpm --filter @skp/server deploy --prod --legacy /prod \
 && mkdir -p /prod/packages/web \
 && cp -R ./packages/web/dist /prod/packages/web/dist \
 && cp -R ./contracts /prod/contracts

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
ARG VERSION=dev
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="SecretKeyPreview" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}"

ENV NODE_ENV=production \
    SKP_HOST=0.0.0.0 \
    SKP_PORT=4173 \
    SKP_DATA_DIR=/data \
    SKP_LOG_LEVEL=info \
    SKP_TLS_MIN_VERSION=TLSv1.3 \
    SKP_CERTS_DIR=/certs
# SKP_TLS_CERT_PATH / SKP_TLS_KEY_PATH default to /certs/localhost.pem and
# /certs/localhost-key.pem inside docker-entrypoint.sh (kept out of ENV so no
# secret-looking values appear in image metadata).

WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 10001 skp \
 && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin skp \
 && mkdir -p /data /run/secrets /certs \
 && chown skp:skp /data /run/secrets /certs

COPY --from=build --chown=skp:skp /prod/node_modules ./node_modules
COPY --from=build --chown=skp:skp /prod/package.json ./package.json
COPY --from=build --chown=skp:skp /app/packages/server/dist ./packages/server/dist
COPY --from=build --chown=skp:skp /prod/contracts ./contracts
COPY --from=build --chown=skp:skp /prod/packages/web/dist ./packages/web/dist
COPY --chown=root:root --chmod=0755 docker/docker-entrypoint.sh /usr/local/bin/skp-entrypoint

USER skp
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "const p=process.env.SKP_PORT||4173;fetch('http://127.0.0.1:'+p+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["skp-entrypoint"]
