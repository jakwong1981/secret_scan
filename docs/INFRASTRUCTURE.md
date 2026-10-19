# Infrastructure & Deployment Topology — SecretKeyPreview

## 1. Runtime requirements

| Component                   | Requirement                                                              |
| --------------------------- | ------------------------------------------------------------------------ |
| Node.js                     | ≥ 22.14 (developed on 26.7; uses `node:sqlite`, global `fetch`)          |
| pnpm                        | 11.22 (corepack-managed via `packageManager`)                            |
| Docker (containerised mode) | 24+ with buildx; Debian-slim glibc image                                 |
| macOS                       | 13+ recommended for Keychain features (application still runs elsewhere) |
| Storage                     | ~200 MB for `node_modules` + build; SQLite DB in `SKP_DATA_DIR`          |
| Network                     | none outbound except: Google OAuth (login) and provider probes (opt-in)  |

## 2. Environment variables

| Variable                                                  | Default                            | Purpose                                                                           |
| --------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| `SKP_HOST` / `SKP_PORT`                                   | `127.0.0.1` / `4173`               | bind address (HTTPS)                                                              |
| `SKP_PUBLIC_ORIGIN`                                       | `https://127.0.0.1:4173`           | origin used for OAuth redirect + HSTS                                             |
| `SKP_DATA_DIR` / `SKP_DB_FILE`                            | `./data` / `secretkeypreview.db`   | SQLite location                                                                   |
| `SKP_TLS_CERT_PATH` / `SKP_TLS_KEY_PATH`                  | `./certs/localhost{,-key}.pem`     | TLS material                                                                      |
| `SKP_TLS_MIN_VERSION`                                     | `TLSv1.3`                          | protocol floor (`TLSv1.2` allowed)                                                |
| `SKP_ENABLE_HTTP_REDIRECT` / `SKP_HTTP_REDIRECT_PORT`     | `false` / `4180`                   | optional loopback 308 redirector                                                  |
| `SKP_VAULT_MASTER_KEY_FILE`                               | –                                  | 32-byte base64 key file (container path `/run/secrets/vault_master_key`)          |
| `SKP_VAULT_MASTER_PASSWORD`                               | –                                  | Argon2-grade KDF seed when no keychain                                            |
| `SKP_VAULT_KEYCHAIN_SERVICE`                              | `SecretKeyPreview.vault`           | keychain item name                                                                |
| `SKP_GOOGLE_CLIENT_ID` / `SKP_GOOGLE_CLIENT_SECRET`       | –                                  | OAuth client                                                                      |
| `SKP_GOOGLE_ALLOWED_EMAILS`                               | –                                  | comma-separated owner allow-list                                                  |
| `SKP_SESSION_IDLE_MINUTES` / `SKP_SESSION_ABSOLUTE_HOURS` | `30` / `12`                        | session policy                                                                    |
| `SKP_ENABLE_REGISTRATION`                                 | unset → on for loopback binds, off otherwise | self-service sign-up; set `true`/`false` to override (compose sets `true` for its loopback-bound deployment) |
| `SKP_PASSWORD_MIN_LENGTH`                                 | `12`                               | enforced on bootstrap/change                                                      |
| `SKP_SCAN_ROOT`                                           | `~` (native) / `/scan` (container) | root resolved by source paths                                                     |
| `SKP_KEYCHAIN_SCAN`                                       | `true`                             | set `false` in containers/CI                                                      |
| `SKP_VERIFY_KEYS_OPT_IN`                                  | `false`                            | enable provider probes                                                            |
| `SKP_NODE_ENV` / `SKP_LOG_LEVEL` / `SKP_LOG_PRETTY`       | `production` / `info` / –          | logging                                                                           |
| `VITE_API_ORIGIN` / `VITE_DEV_PORT`                       | `https://127.0.0.1:4173` / `5173`  | dev-server proxy target only; the built bundle always calls same-origin `/api/v1` |

## 3. Topology

```
Owner browser ──HTTPS/TLS1.3──► 127.0.0.1:4173 (node:https, Fastify)
                                   │
                                   ├─ /api/v1/*        (JSON + envelope)
                                   ├─ /scans/:id/events (SSE)
                                   └─ static SPA (packages/web/dist)
                                        └─ SPA fallback: GET on any non-/api/v1
                                           path returns index.html (client routes)
                                   │
                                   ├─ SQLite (WAL) in SKP_DATA_DIR
                                   ├─ macOS Keychain (vault master key, optional scan metadata)
                                   └─ read-only files under SKP_SCAN_ROOT
```

Container (Docker) adds: non-root uid 10001, `read_only: true` rootfs, `tmpfs:/tmp`,
`cap_drop: ALL`, named volume `skp-data`, `/certs` and `/scan` read-only bind mounts,
healthcheck via `node -e require('node:https').get('https://127.0.0.1:4173/api/v1/health', { rejectUnauthorized: false }, …)` (HTTPS-only server),
optional `nginx-tls` profile for public deployments.

## 4. Migration & rollback

```bash
# native
pnpm --filter @skp/server migrate            # apply
pnpm --filter @skp/server migrate -- --down 1  # roll back the last migration

# container (runs automatically on start; SKP_MIGRATIONS=false to disable)
docker compose --env-file .env run --rm app node ./packages/server/dist/infra/db/migrate.js
```

Each migration is `{ id, up: string[], down: string[] }` executed inside a single
transaction per migration; `_migrations` records what ran. Current set:
`0001_initial` (schema), `0002_provider_evidence` (adds
`api_keys.provider_evidence`, backfilled to `env-hint`) and `0003_key_sources`
(`key_sources`, backfilled from each key's current home). The last two are applied
automatically on the next server start; the following scan then re-derives the
provider from the persisted evidence, so existing rows self-heal.

## 5. Deployment commands

```bash
make docker                    # local image (host arch)
make docker-push               # PLATFORMS=linux/amd64,linux/arm64 REGISTRY=...
make tar                       # air-gapped archive → build/secretkeypreview-<version>.tar
make deploy-local              # ./scripts/deploy.sh local
make deploy-remote             # REMOTE_HOST=user@host ./scripts/deploy.sh remote
./scripts/deploy.sh rollback <tag>
./scripts/deploy.sh logs | status | stop
./scripts/scan-check.sh        # pre-deploy / CI smoke test
```

## 6. Connection / concurrency notes

- SQLite runs in WAL mode with `busy_timeout = 5000`; the app is single-user so a
  single connection serves all requests. Container reads of the mounted scan root
  are read-only, so no lock contention with host tools.
- Rate limits: auth 10/5 min per route, bootstrap 5/10 min, scans 6/min.
