#!/usr/bin/env bash
# scripts/deploy.sh
# Deployment helper: local (compose), remote (ssh + docker load), rollback, logs, status, stop.
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
PORT="${SKP_PORT:-4173}"
CERTS_DIR="${SKP_CERTS_DIR:-./certs}"
HEALTH_URL="https://127.0.0.1:${PORT}/health"
SSH=(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${REMOTE_USER}@${REMOTE_HOST}")

log()  { printf '\033[0;36m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33m[deploy]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[0;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

require_docker() { command -v docker >/dev/null 2>&1 || die "docker not found in PATH"; }
require_env()    { [ -f "$ENV_FILE" ] || die "missing $ENV_FILE (cp .env.example $ENV_FILE)"; }

usage() {
  cat <<'EOF'
Usage: deploy.sh <command> [args]

Commands:
  local                build + run docker-compose on this host (loopback only, HTTPS)
  remote               ship compose + .env + image to $REMOTE_HOST and start it
  rollback <tag>       redeploy a previously loaded image tag on $REMOTE_HOST
  logs                 follow container logs
  status               show container status
  stop                 stop the stack (keeps the data volume)

Key environment variables:
  SKP_IMAGE_TAG              image tag to deploy (default: latest)
  SKP_PORT                   host port mapped to the container (default: 4173)
  REMOTE_HOST                user@host for remote deploy
  REMOTE_DIR                 target directory on the remote host
  SKP_VAULT_MASTER_KEY_FILE   absolute path to the 32-byte base64 vault key
  SKP_CERTS_DIR               directory holding localhost.pem / localhost-key.pem
  SKP_SCAN_HOST_DIR           host directory mounted read-only at /scan

Examples:
  ./scripts/deploy.sh local
  REMOTE_HOST=jack@mac-mini.local SKP_IMAGE_TAG=1.0.0 ./scripts/deploy.sh remote
  REMOTE_HOST=jack@mac-mini.local ./scripts/deploy.sh rollback 0.9.4
EOF
}

compose() { docker compose --file "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

ensure_tls_material() {
  if [ ! -f "${CERTS_DIR}/localhost.pem" ] || [ ! -f "${CERTS_DIR}/localhost-key.pem" ]; then
    die "missing TLS material in ${CERTS_DIR} - run scripts/setup-tls.sh first"
  fi
}

ensure_vault_key() {
  local key
  key="$(grep -E '^[[:space:]]*SKP_VAULT_MASTER_KEY_FILE=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
  [ -n "$key" ] || key="./secrets/vault_master_key"
  if [ ! -f "$key" ]; then
    mkdir -p "$(dirname "$key")"
    openssl rand -base64 32 > "$key"
    log "generated vault master key: $key"
  fi
  chmod 600 "$key"
  warn "the vault key unlocks every stored API key - back it up or lose access forever"
}

wait_healthy() {
  local i
  for i in $(seq 1 30); do
    if curl -kfsS "$HEALTH_URL" >/dev/null 2>&1; then
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
  ensure_tls_material
  ensure_vault_key
  log "building and starting stack ($COMPOSE_FILE)"
  compose up -d --build
  wait_healthy || true
  log "open https://127.0.0.1:${PORT}"
}

remote_up() {
  require_docker
  [ -n "$REMOTE_HOST" ] || die "set REMOTE_HOST=user@host"
  require_env
  ensure_tls_material
  log "preparing remote host ${REMOTE_HOST}:${REMOTE_DIR}"
  "${SSH[@]}" "mkdir -p '${REMOTE_DIR}/certs' '${REMOTE_DIR}/secrets'"
  tar -czf - "$COMPOSE_FILE" "$ENV_FILE" docker \
    | "${SSH[@]}" "cd '${REMOTE_DIR}' && tar -xzmf -"
  tar -czf - -C "$CERTS_DIR" . | "${SSH[@]}" "cd '${REMOTE_DIR}/certs' && tar -xzmf -"
  chmod 600 "${CERTS_DIR}/localhost-key.pem" 2>/dev/null || true
  log "transferring TLS material and vault key"
  if [ -f "./secrets/vault_master_key" ]; then
    tar -czf - -C ./secrets . | "${SSH[@]}" "cd '${REMOTE_DIR}/secrets' && tar -xzmf -"
  else
    warn "no ./secrets/vault_master_key found; the remote host will derive the key from SKP_VAULT_MASTER_PASSWORD"
  fi
  log "transferring image ${IMAGE_NAME}:${IMAGE_TAG}"
  docker save "${IMAGE_NAME}:${IMAGE_TAG}" | "${SSH[@]}" "docker load"
  log "starting stack on ${REMOTE_HOST}"
  "${SSH[@]}" "cd '${REMOTE_DIR}' && SKP_IMAGE_TAG='${IMAGE_TAG}' SKP_CERTS_DIR='${REMOTE_DIR}/certs' docker compose --file '${COMPOSE_FILE}' --env-file '${ENV_FILE}' up -d"
  if "${SSH[@]}" "curl -kfsS '${HEALTH_URL}' >/dev/null"; then
    log "remote deployment healthy on ${REMOTE_HOST}:${PORT}"
  else
    warn "remote health check failed; inspect on the host: cd ${REMOTE_DIR} && docker compose logs"
  fi
}

remote_rollback() {
  local prev="${1:-}"
  [ -n "$REMOTE_HOST" ] || die "set REMOTE_HOST=user@host"
  [ -n "$prev" ] || die "usage: ./scripts/deploy.sh rollback <tag>"
  log "rolling back ${REMOTE_HOST} to ${IMAGE_NAME}:${prev}"
  "${SSH[@]}" "cd '${REMOTE_DIR}' \
&& sed -i.bak 's/^SKP_IMAGE_TAG=.*/SKP_IMAGE_TAG=${prev}/' '${ENV_FILE}' \
&& docker compose --file '${COMPOSE_FILE}' --env-file '${ENV_FILE}' up -d \
&& curl -kfsS '${HEALTH_URL}' >/dev/null"
  log "rollback complete"
}

logs()   { require_env; compose logs -f --tail="${TAIL:-200}"; }
status() { require_env; compose ps; }
stop()   { require_env; compose down; }

case "$CMD" in
  local)          local_up ;;
  remote)         remote_up ;;
  rollback)       remote_rollback "${1:-}" ;;
  logs)           logs ;;
  status)         status ;;
  stop)           stop ;;
  help|-h|--help) usage ;;
  *)              usage; die "unknown command: $CMD" ;;
esac
