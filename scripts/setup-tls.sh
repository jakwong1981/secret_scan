#!/usr/bin/env bash
# scripts/setup-tls.sh
# Issues the local HTTPS certificate used by SecretKeyPreview and installs it
# into the macOS trust store so Chrome/Safari open https://127.0.0.1 without a
# warning. Prefers mkcert; falls back to a self-managed local CA via openssl.
set -Eeuo pipefail

CERTS_DIR="${SKP_CERTS_DIR:-./certs}"
ENV_FILE="${ENV_FILE:-.env}"

CERT_FILE="${CERTS_DIR}/localhost.pem"
KEY_FILE="${CERTS_DIR}/localhost-key.pem"
CA_FILE="${CERTS_DIR}/local-ca.pem"

log() { printf '\033[0;36m[tls]\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33m[tls]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[0;31m[tls]\033[0m %s\n' "$*" >&2; exit 1; }

mkdir -p "$CERTS_DIR"
chmod 700 "$CERTS_DIR"

BASE_HOST="$(hostname)"
case "$BASE_HOST" in
  *.local) LOCAL_FQDN="$BASE_HOST" ;;
  *) LOCAL_FQDN="$BASE_HOST.local" ;;
esac
HOSTS=(localhost 127.0.0.1 ::1 "$BASE_HOST" "$LOCAL_FQDN")

write_env() {
  local abs_cert abs_key
  abs_cert="$(cd "$(dirname "$CERT_FILE")" && pwd)/$(basename "$CERT_FILE")"
  abs_key="$(cd "$(dirname "$KEY_FILE")" && pwd)/$(basename "$KEY_FILE")"
  if [ -f "$ENV_FILE" ]; then
    sed -i.bak "s|^SKP_TLS_CERT_PATH=.*|SKP_TLS_CERT_PATH=${abs_cert}|" "$ENV_FILE"
    sed -i.bak "s|^SKP_TLS_KEY_PATH=.*|SKP_TLS_KEY_PATH=${abs_key}|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
    log "updated $ENV_FILE with the certificate paths"
  fi
}

openssl_config() {
  local file="$1"
  {
    echo "[req]"
    echo "distinguished_name = dn"
    echo "req_extensions = v3_req"
    echo "prompt = no"
    echo "[dn]"
    echo "CN = SecretKeyPreview local development"
    echo "O = SecretKeyPreview"
    echo "[v3_req]"
    echo "subjectAltName = @alt_names"
    echo "basicConstraints = critical, CA:FALSE"
    echo "keyUsage = critical, digitalSignature, keyEncipherment"
    echo "extendedKeyUsage = serverAuth"
    echo "[v3_ca]"
    echo "subjectKeyIdentifier = hash"
    echo "authorityKeyIdentifier = keyid:always,issuer"
    echo "basicConstraints = critical, CA:TRUE"
    echo "keyUsage = critical, digitalSignature, cRLSign, keyCertSign"
    echo "[alt_names]"
    echo "DNS.1 = localhost"
    echo "DNS.2 = $(hostname)"
    echo "DNS.3 = ${LOCAL_FQDN}"
    echo "IP.1 = 127.0.0.1"
    echo "IP.2 = ::1"
  } > "$file"
}

issue_with_mkcert() {
  command -v mkcert >/dev/null 2>&1 || return 1
  log "using mkcert"
  mkcert -install
  mkcert -cert-file "$CERT_FILE" -key-file "$KEY_FILE" "${HOSTS[@]}"
  return 0
}

issue_with_openssl() {
  command -v openssl >/dev/null 2>&1 || die "neither mkcert nor openssl is available"
  log "using openssl (creating a local CA)"
  local ca_key="${CERTS_DIR}/local-ca.key" server_key="${CERTS_DIR}/localhost-key.pem"
  local csr="${CERTS_DIR}/localhost.csr" ca_cfg="${CERTS_DIR}/ca.cnf" ext="${CERTS_DIR}/v3.ext"

  openssl ecparam -name prime256v1 -genkey -noout -out "$ca_key"
  cat > "$ca_cfg" <<EOF
[req]
distinguished_name = dn
prompt = no
[dn]
CN = SecretKeyPreview Local CA
O = SecretKeyPreview
[x509_extensions]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
EOF
  openssl req -x509 -new -key "$ca_key" -days 3650 -sha256 -config "$ca_cfg" -out "$CA_FILE"

  openssl ecparam -name prime256v1 -genkey -noout -out "$server_key"
  openssl_config "$ext"
  openssl req -new -key "$server_key" -out "$csr" -config "$ext"
  openssl x509 -req -in "$csr" -CA "$CA_FILE" -CAkey "$ca_key" -CAcreateserial \
    -days 825 -sha256 -extfile "$ext" -extensions v3_req -out "$CERT_FILE"

  cat "$CERT_FILE" "$CA_FILE" > "${CERTS_DIR}/localhost-chain.pem"
  mv "${CERTS_DIR}/localhost-chain.pem" "$CERT_FILE"
  rm -f "$csr" "$ext" "$ca_cfg" "${CERTS_DIR}/local-ca.srl"

  if [ "$(uname -s)" = "Darwin" ]; then
    log "trusting the local CA in the login keychain (one-time, no sudo)"
    security add-trusted-cert -d -r trustRoot -k "${HOME}/Library/Keychains/login.keychain-db" "$CA_FILE" \
      || warn "could not add the CA to the login keychain"
    security add-trusted-cert -d -r trustRoot /Library/Keychains/System.keychain "$CA_FILE" 2>/dev/null \
      && log "CA also trusted system-wide" \
      || warn "system keychain trust skipped (browsers will still trust via the login keychain)"
  fi
}

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ] && [ "${SKP_TLS_FORCE:-false}" != "true" ]; then
  log "certificate already present: $CERT_FILE"
  log "regenerate with: SKP_TLS_FORCE=true scripts/setup-tls.sh"
else
  issue_with_mkcert || issue_with_openssl
  chmod 600 "$KEY_FILE"
  chmod 644 "$CERT_FILE"
  log "wrote $CERT_FILE and $KEY_FILE"
fi

write_env

log "verify with:"
echo "    openssl s_client -connect 127.0.0.1:4173 -servername localhost < /dev/null | openssl x509 -noout -subject -ext subjectAltName"
if ! command -v mkcert >/dev/null 2>&1; then
  warn "Firefox keeps its own certificate store: import $CA_FILE via about:preferences#privacy if you use Firefox."
fi
log "start the app with: pnpm dev (or make deploy-local)"
