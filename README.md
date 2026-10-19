# SecretKeyPreview

Local vault that scans a Mac for every AI/LLM API key (CLI tools, IDEs, dotfiles,
environment files and macOS Keychain metadata), classifies them by provider, and
previews them behind re-authentication. Sign-up is self-service: the first page is
the login page, `Create one` opens a public register page, and a new account signs
in like any other.

**HTTPS only.** The server terminates TLS 1.3 itself with a locally-issued,
keychain-trusted certificate — there is no plaintext mode.

```
docs/IMPLEMENTATION_PLAN.md   design + rollout plan (incl. Dockercompose/scripts)
docs/SPECIFICATION.md         program spec: structure, dependency graph, API
docs/FUNCTION_SPEC.md         business flows, state transitions, validation rules
docs/INFRASTRUCTURE.md        runtime requirements, env vars, migration/rollback
docs/DIAGRAMS.md              Mermaid sequence / component / state / topology
docs/TESTING.md               unit cases + functional test matrix
contracts/openapi.yaml        API contract (checked in, contract-first)
```

## Quick start (native, recommended)

```bash
./scripts/setup-tls.sh        # issue + trust the local HTTPS certificate (once)
cp .env.example .env          # adjust SKP_SCAN_ROOT, SKP_GOOGLE_* if needed
pnpm install                  # installs deps and builds @skp/contracts
pnpm dev                      # API https://127.0.0.1:4173 + UI https://127.0.0.1:5173
```

Open <https://127.0.0.1:5173> → create the owner master password (first run) or sign
in → **Scan now**.

## Quick start (Docker)

```bash
./scripts/setup-tls.sh
cp .env.example .env          # set SKP_SCAN_HOST_DIR=/Users/<you>
./scripts/deploy.sh local     # builds the image and starts compose (loopback only)
./scripts/scan-check.sh       # end-to-end smoke test on synthetic fixtures
```

## Test / build

```bash
pnpm test          # 65 server tests + 18 frontend tests
pnpm build         # web bundle + server dist
pnpm lint          # eslint (typescript)
pnpm typecheck     # tsc --noEmit across the workspace
./scripts/scan-check.sh
```

## Security model in one paragraph

Master password → Argon2-grade scrypt hash, session cookie `httpOnly; Secure;
SameSite=Strict`. Every secret is stored as an `AES-256-GCM` envelope keyed by a
master key held in the macOS login keychain (or `SKP_VAULT_MASTER_KEY_FILE` in
containers). Keys are never logged (pino redaction paths) and are only shown
masked; revealing the real value requires re-entering the master password and is
audited. All traffic is loopback + TLS unless you explicitly publish the port.
