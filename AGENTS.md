# Repository Guidelines

Local vault that scans a Mac for AI/LLM API keys, classifies them by provider,
and previews them behind re-authentication (master password or Google OAuth via
`SKP_GOOGLE_*`). A fresh install bootstraps the owner account from the login
page; afterwards anyone can register from the public `/register` page (rate
limited). Every account previews the same vault, so the port is the trust
boundary. **HTTPS only** — the server terminates TLS 1.3 with the
locally-issued keychain-trusted cert from `scripts/setup-tls.sh`;
`SKP_ENABLE_HTTP_REDIRECT` adds an optional 4180 hop. `AGENT.md` is the original
product brief.

## Project Structure & Module Organization

pnpm workspace monorepo (`pnpm@11.22.0`, Node ≥ 22.14.0): `packages/contracts`
(`@skp/contracts` — zod schemas + inferred types, the contract source shared by
server and web), `packages/server` (`@skp/server`, Fastify + `node:sqlite`),
`packages/web` (`@skp/web`, React 19 + Vite + Tailwind 4, React Query for server
state, Zustand for the session store, react-router-dom for routes).

Server layering is strict, layer-skipping prohibited:
`modules/*/routes.ts` (thin — zod validation, envelope) →
`modules/*/service.ts` (business logic, no `FastifyReply`) →
`infra/db/repositories/*` (parameterized SQL only) → `core/crypto/*`
(AES-256-GCM vault, scrypt, masking). Scans flow through
`modules/scans/service.ts` into `infra/scanner/*` (source/provider registries,
parsers). `core/errors/AppError` → central handler → `ApiErrorResponse`.
Storage is `node:sqlite` with WAL and idempotent migrations in
`infra/db/migrations/`.

## Build, Test, and Development Commands

```bash
pnpm install            # postinstall builds @skp/contracts
pnpm dev                # API https://127.0.0.1:4173 + UI https://127.0.0.1:5173, both HTTPS
pnpm build              # web bundle, then server dist
pnpm test               # 65 server + 18 frontend tests
pnpm lint && pnpm typecheck
```

`pnpm dev` fails without a `.env` at the repo root — server/web dev, `start`, and
`migrate` all load it via `--env-file=../../.env`. First run:
`./scripts/setup-tls.sh` then `cp .env.example .env` (without `certs/` the Vite
dev server silently falls back to plain HTTP).

Single test: `pnpm --filter @skp/server exec vitest run test/unit/crypto.test.ts`
(or `... exec vitest -t "name"`). DB migration: `pnpm --filter @skp/server
migrate`. Smoke test: `./scripts/scan-check.sh`. Docker: `make docker`,
`make deploy-local`, `make deploy-remote REMOTE_HOST=…`.

## Coding Style & Naming Conventions

TypeScript strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext
ESM with `.js` specifiers on relative imports. ESLint (`eslint.config.mjs`,
typescript-eslint recommended): `no-explicit-any` error, `no-console` allows only
`warn`/`error`, `consistent-type-imports` with separate type imports,
`eqeqeq` "smart", `prefer-const`; leading-underscore names are exempt from
unused-vars, which is off entirely in web files. Prettier formats the workspace
(`pnpm format`). Web HTTP calls go only through
`packages/web/src/api/client.ts`.

## Testing Guidelines

Vitest. Server: `test/unit/*` + `test/integration/api.test.ts` (`app.inject`);
web: `src/test/*.test.{ts,tsx}` (React Testing Library, jsdom). Fixtures are
synthetic — never commit real credentials. Setup uses a temp dir
(`test/setup.ts`), keeping suites independent.

## Configuration

`SKP_*` variables are parsed once by the zod schema in
`packages/server/src/config/env.ts`; add new settings there with defaults rather
than reading `process.env` elsewhere. `VITE_API_ORIGIN` is web-only. Copy
`.env.example` to `.env` (gitignored, never committed). `data/`, `certs/`, and
`secrets/` are gitignored and must stay that way. The API contract
`contracts/openapi.yaml` lives at the repo root — it is not the same directory
as `packages/contracts`.

## Commit & Pull Request Guidelines

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`); history is a single
release commit. Update the `docs/` spec set and `contracts/openapi.yaml` when
behaviour or the API surface changes.
