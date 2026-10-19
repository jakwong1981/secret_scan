#!/usr/bin/env bash
# scripts/deploy.sh — compose deploy: local, remote (ssh), rollback, logs, status, stop.
set -Eeuo pipefail

CMD="${1:-help}"
[ $# -gt 0 ] && shift

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-.env}"
IMAGE_NAME="${IMAGE_NAME:-secretkeypreview}"
IMAGE_TAG="${SKP_IMAGE_TAG:-latest}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/secretkeypreview}"
CERTS_DIR="${SKP_CERTS_DIR:-./certs}"
PORT="${SKP_PORT:-4173}"
HEALTH_URL="https://127.0.0.1:${PORT}/api/v1/health"

log()  { printf '\033[0;36m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33m[deploy]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[0;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: deploy.sh <command> [args]

Commands:
  local                build + run docker-compose on this host (loopback only, HTTPS)
  remote               ship compose + .env + image to \$REMOTE_HOST and start it
  rollback <tag>       redeploy a previously loaded image tag on \$REMOTE_HOST
  logs                 follow container logs
  status               show container status
  stop                 stop the stack (keeps the data volume)

Environment:
  SKP_IMAGE_TAG   image tag (default: latest)      SKP_PORT  host port (default: 4173)
  REMOTE_HOST     user@host for remote deploy      REMOTE_DIR target dir on the host
  SKP_CERTS_DIR   holds localhost.pem + localhost-key.pem
  SKP_VAULT_MASTER_KEY_FILE  absolute path to the 32-byte base64 vault key
  SKP_SCAN_HOST_DIR  host directory mounted read-only at /scan
EOF
}

compose() { docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }
remote()  { ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${REMOTE_USER}@${REMOTE_HOST}" "$@"; }
remote_compose() { remote "cd '${REMOTE_DIR}' && docker compose --file '${COMPOSE_FILE}' --env-file '${ENV_FILE}' $*"; }

require_docker() { command -v docker >/dev/null 2>&1 || die "docker not found in PATH"; }
require_env()    { [ -f "$ENV_FILE" ] || die "missing $ENV_FILE (cp .env.example $ENV_FILE)"; }
require_remote() { [ -n "$REMOTE_HOST" ] || die "set REMOTE_HOST=user@host"; }

# TLS is mandatory: the app refuses to serve plaintext, and the cert must be
# trusted by the client (macOS login keychain) or the browser will reject it.
require_tls() {
  [ -f "${CERTS_DIR}/localhost.pem" ] && [ -f "${CERTS_DIR}/localhost-key.pem" ] \
    || die "missing TLS material in ${CERTS_DIR} - run scripts/setup-tls.sh first"
}

# The vault key unwraps every stored API key; generate once, then keep it safe.
ensure_vault_key() {
  local key
  key="$(sed -n 's/^[[:space:]]*SKP_VAULT_MASTER_KEY_FILE=//p' "$ENV_FILE" | tr -d '"')"
  [ -n "$key" ] || key="./secrets/vault_master_key"
  if [ ! -f "$key" ]; then
    mkdir -p "$(dirname "$key")"
    openssl rand -base64 32 > "$key"
    log "generated vault master key: $key"
  fi
  chmod 600 "$key"
  warn "the vault key unlocks every stored API key - back it up or lose access forever"
}

healthy() { curl -kfsS "$HEALTH_URL" >/dev/null 2>&1; }

wait_healthy() {
  for _ in $(seq 30); do
    if healthy; then
      log "health check OK -> $HEALTH_URL"
      return 0
    fi
    sleep 2
  done
  warn "health check did not pass within 60s; inspect with: ./scripts/deploy.sh logs"
  return 1
}

local_up() {
  require_docker
  require_env
  require_tls
  ensure_vault_key
  log "building and starting stack ($COMPOSE_FILE)"
  compose up -d --build
  wait_healthy || true
  log "open https://127.0.0.1:${PORT}"
}

remote_up() {
  require_docker
  require_remote
  require_env
  require_tls
  log "preparing remote host ${REMOTE_HOST}:${REMOTE_DIR}"
  remote "mkdir -p '${REMOTE_DIR}/certs' '${REMOTE_DIR}/secrets'"
  tar -czf - "$COMPOSE_FILE" "$ENV_FILE" docker | remote "cd '${REMOTE_DIR}' && tar -xzmf -"
  tar -C "$CERTS_DIR" -czf - . | remote "tar -C '${REMOTE_DIR}/certs' -xzmf -"

  log "transferring vault key"
  if [ -f "./secrets/vault_master_key" ]; then
    tar -C ./secrets -czf - . | remote "tar -C '${REMOTE_DIR}/secrets' -xzmf -"
  else
    warn "no ./secrets/vault_master_key; the remote host derives the key from SKP_VAULT_MASTER_PASSWORD"
  fi

  log "transferring image ${IMAGE_NAME}:${IMAGE_TAG}"
  docker save "${IMAGE_NAME}:${IMAGE_TAG}" | remote docker load
  log "starting stack on ${REMOTE_HOST}"
  remote_compose up -d
  if remote "curl -kfsS '${HEALTH_URL}' >/dev/null"; then
    log "remote deployment healthy on ${REMOTE_HOST}:${PORT}"
  else
    warn "remote health check failed; inspect on the host: cd ${REMOTE_DIR} && docker compose logs"
  fi
}

rollback() {
  local prev="${1:-}"
  require_remote
  [ -n "$prev" ] || die "usage: ./scripts/deploy.sh rollback <tag>"
  log "rolling back ${REMOTE_HOST} to ${IMAGE_NAME}:${prev}"
  remote "cd '${REMOTE_DIR}' && sed -i.bak 's/^SKP_IMAGE_TAG=.*/SKP_IMAGE_TAG=${prev}/' '${ENV_FILE}'"
  remote_compose up -d
  remote "curl -kfsS '${HEALTH_URL}' >/dev/null" \
    || die "rollback health check failed; run: ./scripts/deploy.sh logs"
  log "rollback complete"
}

case "$CMD" in
  local)          local_up ;;
  remote)         remote_up ;;
  rollback)       rollback "${1:-}" ;;
  logs)           require_env; compose logs -f --tail="${TAIL:-200}" ;;
  status)         require_env; compose ps ;;
  stop)           require_env; compose down ;;
  help|-h|--help) usage ;;
  *)              usage; die "unknown command: $CMD" ;;
esac
