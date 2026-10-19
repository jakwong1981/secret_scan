#!/usr/bin/env bash
# scripts/scan-check.sh
# End-to-end smoke test against synthetic fixtures (never real credentials):
# starts the server with a throwaway HOME + data dir, exercises
# health -> bootstrap -> scan -> keys -> re-auth -> reveal -> audit.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${SKP_CHECK_PORT:-4173}"
BASE="https://127.0.0.1:${PORT}/api/v1"
WORK="$(mktemp -d)/secretkeypreview-check"
FIXTURE_HOME="${WORK}/home"
CURL="curl -ksS"

log() { printf '\033[0;36m[check]\033[0m %s\n' "$*"; }
die() { printf '\033[0;31m[check]\033[0m %s\n' "$*" >&2; exit 1; }

SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$(dirname "$WORK")" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$FIXTURE_HOME/.codex" "$FIXTURE_HOME/.ollama" "$WORK/data" "$WORK/certs" "$WORK/secrets" \
  "$FIXTURE_HOME/.pi/agent" "$FIXTURE_HOME/.qwen" "$FIXTURE_HOME/.continue"

log "creating synthetic fixture home ($FIXTURE_HOME)"
cat > "$FIXTURE_HOME/.codex/auth.json" <<'EOF'
{
  "auth_mode": "apikey",
  "OPENAI_API_KEY": "sk-ant-test-abcdefghijklmnopqrstuvwxyz",
  "tokens": { "last_refresh": "2026-08-01T00:00:00Z" }
}
EOF
cat > "$FIXTURE_HOME/.ollama/config.json" <<'EOF'
{ "token": "hf_testtokenabcdefghijklmnop" }
EOF
cat > "$FIXTURE_HOME/.zshrc" <<'EOF'
export ANTHROPIC_API_KEY="sk-ant-test-Zyxwvutsrqponmlkjihgfedcba"
export GITHUB_TOKEN="ghp_testtokenabcdefghijklmnop12"
export PATH="/usr/bin:/bin"
EOF
cat > "$FIXTURE_HOME/.pi/agent/auth.json" <<'EOF'
{
  "kimi-coding": { "type": "oauth", "access": "e30.eyJhbGciOiJSUzI1NiJ9.kimi-access-signature" },
  "qwen-token-plan-individual": { "type": "oauth", "key": "sk-sp-test-AbCdEfGhIjKlMnOpQrStUvWxYz0123" }
}
EOF
cat > "$FIXTURE_HOME/.qwen/token" <<'EOF'
sk-sp-test-Zyxwvutsrqponmlkjihgfedcba0123
EOF
cat > "$FIXTURE_HOME/.continue/config.yaml" <<'EOF'
models:
  - name: DeepSeek Coder
    provider: deepseek
    model: deepseek-coder
    apiKey: sk-test7ade33b3fe744b83bb017e0efb437dca
EOF

openssl rand -base64 32 > "$WORK/secrets/vault_master_key"
chmod 600 "$WORK/secrets/vault_master_key"

if [ ! -f "${ROOT}/certs/localhost.pem" ]; then
  log "no certificate found, generating one"
  (cd "$ROOT" && ./scripts/setup-tls.sh >/dev/null 2>&1) || true
fi

log "starting server on 127.0.0.1:${PORT}"
(
  cd "$ROOT/packages/server" \
  && export HOME="$FIXTURE_HOME" \
     SKP_KEYCHAIN_SCAN=false \
     SKP_HOST=127.0.0.1 \
     SKP_PORT="$PORT" \
     SKP_DATA_DIR="$WORK/data" \
     SKP_DB_FILE=check.db \
     SKP_VAULT_MASTER_KEY_FILE="$WORK/secrets/vault_master_key" \
     SKP_TLS_CERT_PATH="${ROOT}/certs/localhost.pem" \
     SKP_TLS_KEY_PATH="${ROOT}/certs/localhost-key.pem" \
     SKP_LOG_LEVEL=error \
     SKP_PASSWORD_MIN_LENGTH=8 \
  && exec node --env-file="${ROOT}/.env" dist/main.js > "${WORK}/server.log" 2>&1
) &
SERVER_PID=$!

for _ in $(seq 1 30); do
  if $CURL "${BASE}/health" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    cat "${WORK}/server.log" >&2 || true
    die "server exited during start-up"
  fi
  sleep 1
done

log "health check"
$CURL "$BASE/health" | grep -q '"tls":true' || die "health endpoint did not report TLS"

log "bootstrapping owner"
COOKIE_JAR="${WORK}/cookies.txt"
$CURL -c "$COOKIE_JAR" -X POST "$BASE/auth/bootstrap" \
  -H 'content-type: application/json' \
  -d '{"email":"check@example.com","masterPassword":"check-master-password"}' >/dev/null

log "unauthenticated access must fail"
$CURL -o /dev/null -w '%{http_code}' "$BASE/keys" | grep -q '^401$' || die "keys endpoint is not protected"

log "running scan over the fixture home"
SCAN_JSON="$($CURL -b "$COOKIE_JAR" -X POST "$BASE/scans")"
TOTAL="$(printf '%s' "$SCAN_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const n=j.data?.outcome?.counts?.totalCount ?? -1;if(n===8)process.stdout.write('8');else process.stderr.write('expected 8 keys, got '+n+'\n');})")"
[ "$TOTAL" = "8" ] || { printf '%s\n' "$SCAN_JSON" >&2; die "scan found an unexpected number of keys ($TOTAL)"; }

log "asserting provider classification"
KEYS_JSON="$($CURL -b "$COOKIE_JAR" "$BASE/keys?limit=20&sort=provider")"
printf '%s' "$KEYS_JSON" | node -e "
let s='';
process.stdin.on('data', (d) => (s += d)).on('end', () => {
  const items = JSON.parse(s).data.items;
  const providers = items.map((k) => k.provider).sort().join(',');
  if (providers !== 'anthropic,anthropic,deepseek,github,huggingface,moonshot,qwen,qwen') {
    process.stderr.write('unexpected classification: ' + providers + '\n');
    process.exit(1);
  }
  for (const item of items) {
    if (item.maskedValue.includes('sk-ant-test') || item.maskedValue.includes('ghp_testtoken')) {
      process.stderr.write('masked value leaked the secret\n');
      process.exit(1);
    }
  }
});
" || die "classification/masking check failed"

log "reveal is gated by re-authentication"
KEY_ID="$(printf '%s' "$KEYS_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).data.items[0].id))")"
$CURL -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/keys/${KEY_ID}/reveal" | grep -q '^401$' \
  || die "reveal did not require re-authentication"

$CURL -b "$COOKIE_JAR" -X POST "$BASE/auth/verify-password" \
  -H 'content-type: application/json' \
  -d '{"masterPassword":"check-master-password"}' >/dev/null

$CURL -b "$COOKIE_JAR" -X POST "$BASE/keys/${KEY_ID}/reveal" | grep -q 'sk-ant-test' \
  || die "reveal after re-authentication did not return the secret"

log "audit trail recorded the reveal"
$CURL -b "$COOKIE_JAR" "$BASE/audit?limit=20" | grep -q 'key.reveal' || die "audit log missing reveal event"

log "ALL CHECKS PASSED"
