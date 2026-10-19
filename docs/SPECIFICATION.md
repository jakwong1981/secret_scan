# Program Specification — SecretKeyPreview

Version 0.1.0 · local vault (multi-member, self-service sign-up) · pnpm workspaces monorepo

## 1. Directory map

```
// /Users/wongchimanjack/github/secretkeypreview
package.json                  # workspace scripts (dev/build/test/lint/typecheck)
pnpm-workspace.yaml           # packages: contracts, server, web
tsconfig.base.json            # strict TS baseline shared by all packages
Makefile                      # docker / deploy / test wrappers
docker-compose.yml            # local + single-host deployment (app, optional nginx-tls)
Dockerfile? -> docker/Dockerfile
docker/Dockerfile             # multi-stage image (node:22-bookworm-slim, uid 10001)
docker/docker-entrypoint.sh   # TLS + volume checks, migrations, boot
docker/nginx.conf             # optional reverse proxy (compose profile: tls)
scripts/setup-tls.sh          # local CA + leaf cert, macOS trust store, .env wiring
scripts/build-docker.sh       # buildx build / push / tar
scripts/deploy.sh             # local | remote | rollback | logs | status | stop
scripts/scan-check.sh         # end-to-end smoke test on synthetic fixtures
contracts/openapi.yaml        # API contract (checked in)
contracts/                    # (runtime-agnostic contract notes; schemas live in the package)
packages/contracts/           # @skp/contracts — zod schemas + inferred TS types (single source)
packages/server/              # @skp/server — Fastify API, scanner, vault, SQLite
packages/web/                 # @skp/web — React 19 + Vite + Tailwind dashboard
docs/                         # this specification set
```

## 2. Layered architecture

```
web (React SPA)
  └── api/client.ts (fetch + envelope) ──► HTTPS ──► server
server (Fastify, /api/v1)
  plugins/auth-guard.ts ───────► routes (thin: validate → call service → envelope)
  modules/*/routes.ts ─────────► modules/*/service.ts   (business logic, no HTTP types)
  modules/*/service.ts ────────► infra/db/repositories/* (all SQL parameterized)
  modules/scans/service.ts ────► infra/scanner/scanner.ts
  infra/scanner/scanner.ts ────► infra/scanner/parsers.ts + provider-registry.ts
  modules/keys/service.ts ─────► core/crypto/vault.ts (AES-256-GCM), password.ts (scrypt)
  core/errors/* ───────────────► central error handler → ApiErrorResponse envelope
```

Layer rules (per `AGENTS.md`): routes never touch SQL; services never touch
`FastifyReply`; repositories never encrypt/decrypt (that is `core/crypto`).

## 3. Server module inventory

| Module    | Path                                     | Responsibility                                                                     |
| --------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| health    | `modules/health/routes.ts`               | liveness, version, TLS flag, HSTS header                                           |
| auth      | `modules/auth/{routes,service}.ts`       | bootstrap, login, sign-up, logout, re-auth, change-password, Google loopback OAuth |
| keys      | `modules/keys/{routes,mapper,probes}.ts` | masked list, detail, gated reveal, provider verification, CRUD                     |
| scans     | `modules/scans/{routes,service}.ts`      | trigger, history, cancel, SSE progress                                             |
| sources   | `modules/sources/{routes,mapper}.ts`     | scan registry CRUD                                                                 |
| settings  | `modules/settings/routes.ts`             | allow-list, session policy, verification opt-in                                    |
| audit     | `modules/audit/{routes,mapper}.ts`       | append-only audit trail                                                            |
| providers | `modules/providers/routes.ts`            | classifier catalogue                                                               |
| scanner   | `infra/scanner/*`                        | source registry, parsers, classifier, orchestrator                                 |
| db        | `infra/db/*`                             | `node:sqlite` connection, migrations, repositories, seeds                          |
| crypto    | `core/crypto/*`                          | scrypt password hashing, AES-256-GCM vault, Google id_token/JWKS, masking          |

## 4. Data model

```
users ──1:N──► sessions ──1:N──► (sensitive_until)
users ──1:N──► google_identities
users ──1:N──► audit_logs            (append-only)
api_keys ──1:N──► key_events
key_sources ──N:1──► api_keys   (every home of a secret; PK key_id+path+pointer)
scan_runs  (status: queued|running|completed|failed|canceled)
sources    (owner-editable registry; seed syncs hints/priority, keeps the owner enable toggle)
providers  (catalogue, seeded from provider-registry.ts)
settings   (singleton row)
oauth_states, login_attempts        (PKCE/nonce single-use, rate limiting)
```

`api_keys` stores `masked_value` + `fingerprint` (sha256, unique index, dedupe) +
`cipher_text/iv/auth_tag` (envelope) + `provider_evidence` (the signal that named
the provider — see §2 of `FUNCTION_SPEC.md`). Keychain items are metadata-only rows
(ciphertext NULL, reveal returns an explanatory error).

Because dedupe keeps one row per secret, `key_sources` records each sighting
(`key_id, source_path, source_pointer` is the primary key, so re-seeing a place
refreshes `last_seen_at`). The API returns it as `MaskedKey.sources`, and
existing keys were backfilled from their own `source_path`.

## 5. Public API (see `contracts/openapi.yaml` for the full contract)

| Method                | Path                                                 | Auth                           | Notes                                           |
| --------------------- | ---------------------------------------------------- | ------------------------------ | ----------------------------------------------- |
| GET                   | `/api/v1/health`                                     | –                              | `tls: true` always                              |
| GET                   | `/api/v1/auth/status`                                | –                              | bootstrap needed? google configured?            |
| POST                  | `/api/v1/auth/bootstrap`                             | –                              | creates owner, sets session cookie              |
| POST                  | `/api/v1/auth/login`                                 | –                              | rate-limited (5 failures / 5 min)               |
| POST                  | `/api/v1/auth/register`                              | – (public, 5/10 min)           | creates an account, `409 EMAIL_TAKEN`           |
| GET                   | `/api/v1/auth/users`                                 | session                        | members with methods + last login               |
| POST                  | `/api/v1/auth/logout`                                | session                        | revokes                                         |
| GET                   | `/api/v1/auth/me`                                    | session                        | current owner                                   |
| POST                  | `/api/v1/auth/verify-password`                       | session                        | grants 5-minute sensitive scope                 |
| POST                  | `/api/v1/auth/change-password`                       | session + sensitive            | rotates other sessions                          |
| GET                   | `/api/v1/auth/google/start`                          | –                              | PKCE + nonce + state                            |
| GET                   | `/api/v1/auth/google/callback`                       | –                              | loopback redirect handler                       |
| GET                   | `/api/v1/keys`                                       | session                        | filters: provider/status/sourceKind/search/sort |
| GET                   | `/api/v1/keys/:id`                                   | session                        | detail + evidence + lifecycle                   |
| POST                  | `/api/v1/keys/:id/reveal`                            | session + sensitive            | decrypt once, 30 s TTL                          |
| POST                  | `/api/v1/keys/:id/verify`                            | session                        | opt-in provider probe                           |
| PATCH/DELETE          | `/api/v1/keys/:id`                                   | session / sensitive            | label, tags, archive, delete                    |
| GET/POST              | `/api/v1/scans`                                      | session                        | history / trigger (sync)                        |
| GET                   | `/api/v1/scans/:id` · `/events` · `POST /:id/cancel` | session                        | SSE progress                                    |
| GET/POST/PATCH/DELETE | `/api/v1/sources[/:id]`                              | session (+ sensitive on write) | registry                                        |
| GET/PUT               | `/api/v1/settings`                                   | session (+ sensitive on write) | policy                                          |
| GET                   | `/api/v1/audit`                                      | session                        | newest first                                    |
| GET                   | `/api/v1/providers`                                  | session                        | catalogue                                       |

Response envelope: `{ code: "OK", message?, data, timestamp, traceId }`.
Error envelope: `{ code, message, data?, timestamp, traceId }`.
