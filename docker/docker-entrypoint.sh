#!/usr/bin/env bash
# docker/docker-entrypoint.sh
# Prepares the volume, applies migrations, then hands over to the Node server.
set -Eeuo pipefail

log() { printf '[skp-entrypoint] %s\n' "$*"; }
die() { printf '[skp-entrypoint] FATAL: %s\n' "$*" >&2; exit 1; }

SKP_DATA_DIR="${SKP_DATA_DIR:-/data}"
SKP_PORT="${SKP_PORT:-4173}"
SKP_MIGRATIONS="${SKP_MIGRATIONS:-true}"
SKP_TLS_CERT_PATH="${SKP_TLS_CERT_PATH:-/certs/localhost.pem}"
SKP_TLS_KEY_PATH="${SKP_TLS_KEY_PATH:-/certs/localhost-key.pem}"

[ -d "$SKP_DATA_DIR" ] || mkdir -p "$SKP_DATA_DIR" 2>/dev/null || die "cannot create $SKP_DATA_DIR"
[ -w "$SKP_DATA_DIR" ] || die "data dir not writable: $SKP_DATA_DIR (mount a volume)"

for f in "$SKP_TLS_CERT_PATH" "$SKP_TLS_KEY_PATH"; do
  [ -r "$f" ] || die "TLS material unreadable: $f (run scripts/setup-tls.sh and mount $SKP_CERTS_DIR)"
done
# Export so the server never falls back to relative host paths inside the image.
export SKP_TLS_CERT_PATH="$SKP_TLS_CERT_PATH"
export SKP_TLS_KEY_PATH="$SKP_TLS_KEY_PATH"
log "TLS enabled: ${SKP_TLS_CERT_PATH} (minimum ${SKP_TLS_MIN_VERSION:-TLSv1.3})"

if [ "${SKP_VAULT_MASTER_KEY_FILE:-}" != "" ]; then
  [ -r "$SKP_VAULT_MASTER_KEY_FILE" ] || die "vault key unreadable: ${SKP_VAULT_MASTER_KEY_FILE}"
  log "vault master key source: ${SKP_VAULT_MASTER_KEY_FILE}"
else
  log "vault master key source: deterministic KDF over SKP_VAULT_MASTER_PASSWORD"
fi

if [ "$SKP_MIGRATIONS" = "true" ]; then
  log "applying database migrations"
  node ./packages/server/dist/infra/db/migrate.js || die "migration failed"
fi

log "starting server on ${SKP_HOST:-0.0.0.0}:${SKP_PORT} (HTTPS)"
exec node ./packages/server/dist/main.js
