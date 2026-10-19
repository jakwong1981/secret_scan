# Functional Specification — SecretKeyPreview

## 1. Discovery pipeline

```
load enabled sources (sources table, seeded from infra/scanner/source-registry.ts)
  → per source:
      file:    stat (≤4 MiB, regular file) → readFileSync → parser
      env-file: dotenv parser
      keychain: security dump-keychain metadata scan (darwin only, switchable)
  → parser emits ParsedEntry { pointer, keyName, value, context }
      json (JSONC tolerant) · yaml · toml · dotenv · raw-regex (bare-token aware)
  → filter: key name matches credential regex, value ≥8 chars, no whitespace,
            not a placeholder (changeme, ..., <...>), and not an env-var name,
            URL, path, dotted identifier or timestamp
  → classifyProviderDetailed() → { provider, evidence }
  → preferProvider() keeps the strongest evidence when one secret has several
      homes, then upsert api_keys (encrypt new values; update last_seen/source/
      mtime/provider/provider_evidence)
  → fingerprint = sha256(value) (or sha256("keychain:path:pointer"))
  → every sighting upserts key_sources on (key_id, source_path, source_pointer):
      one row per secret, one row per place it was seen
  → run summary + SSE progress events
  → afterwards: active keys not seen this run → status = 'removed' + event
```

### Classification precedence

1. Value prefix (longest match; bare `sk-` excluded because OpenAI/Qwen share it).
2. A vendor or CLI token inside the key name / JSON pointer
   (`kimi-coding.access`, `VOLCENGINE_STS_ACCESS_KEY`, `models.providers.byteplus-plan.apiKey`).
3. Sibling fields naming the owner of the value (`{ name: "DeepSeek Coder",
provider: "deepseek", apiKey: … }` → `ParsedEntry.context`).
4. The scan source's provider hint (the vendor that file belongs to).
5. Exact env-var / keychain hints (`DASHSCOPE_API_KEY`, …) — generic names such
   as `OPENAI_API_KEY` are weaker than a file owned by one vendor.
6. Provider name embedded in the key name.
7. `unknown` (still stored so the owner can triage).

One secret can live in several configs (`~/.claude/settings.json`,
`~/.kimi-code/config.toml`, `~/.bailian/config.json`, `~/.qwen/settings.json`).
`preferProvider()` keeps the strongest of the classifications, so an early weak
guess (`openai` for a bare `sk-` value) never wins over a later vendor-named
one, and a key named `ANTHROPIC_AUTH_TOKEN` is never re-attributed by a
`providerHint` on another file holding the same token. The evidence that named
the provider is persisted on the row (`api_keys.provider_evidence`), so its rank
survives between scans; rows written before migration `0002_provider_evidence`
are backfilled to `env-hint`, the rank the scanner used to assume. A rank is
never guessed for a stored provider: an evidence label this build does not know
counts as "no stored evidence" (`asEvidence` → `null`), never as the weakest
rank.

Equal ranks are broken by scan order (source `priority`): stable for a given
registry, but arbitrary for a relay token that two vendors both name — which is
why every home is recorded in `key_sources` and returned as `sources` on the key.

### Registry highlights (verified on the development Mac)

`~/.codex/auth.json|config.toml`, `~/.grok/auth.json|config.toml`,
`~/.bailian/config.json`, `~/.arkcli-bp/config.yaml|.env`,
`~/.gemini/{oauth_creds,google_accounts,settings}.json`, `~/.copilot/config.json`,
`~/.cursor/{cli-config,mcp}.json`, `~/.deepseek/token/*`, `~/.qwen/settings.json|token|.env`,
`~/.continue/{config.yaml,.continuerc.json}`, `~/.config/opencode/{opencode.jsonc,auth.json}`,
`~/.local/share/opencode/auth.json`, `~/.openclaw/openclaw.json`, `~/.hermes/.env`,
`~/.pi/agent/auth.json`, `~/.kimi-code/config.toml`, `~/.ollama/config.json`,
`~/.claude/settings.json` (env block), `~/.claude/session-env/*`, `~/.claude.json`,
`~/.config/colab-cli/token.json`,
`~/.docker/config.json`, `~/.config/configstore/*`, `~/.npmrc`,
`~/.zshrc|.zprofile|.bash_profile|.profile`,
`~/.aws/{credentials,config}` (opt-in), `~/.git-credentials` (opt-in),
`keychain:login:generic-password` (metadata only).

44 registry entries; 40 enabled by default (aws/git-credentials/pypirc stay
off until the owner opts in, keychain follows `SKP_KEYCHAIN_SCAN`).

## 2. Authentication flows

### Password

1. `POST /auth/login` → `login_attempts` recorded; 5 failures / 5 min / email ⇒ 429.
2. `scrypt` verify against `users.password_hash`; success ⇒ server-side session row.
3. Cookie `skp_session` (httpOnly, Secure, SameSite=Strict, Path=/).
4. Guard revalidates every request: not revoked, idle ≤ `session_idle_minutes`,
   absolute ≤ `session_absolute_hours`; idle window is refreshed per request.

### Google (loopback + PKCE)

1. `GET /auth/google/start` stores `state`, `code_verifier`, `nonce` (single-use, 10 min TTL).
2. Browser opens `accounts.google.com/o/oauth2/v2/auth` with `code_challenge=S256`.
3. `GET /auth/google/callback?code&state` → consumes state → token exchange →
   `id_token` validated against Google JWKS (RS256, kid, iss, aud, exp, nbf, nonce).
4. Email must be in `google_allowed_emails` (empty list = bootstrap-only mode) ⇒ 403 otherwise.
5. Identity linked (`google_sub` unique) and a session issued; HTML page notifies the SPA opener.

### Self-service sign-up

1. `/register` is a public page: email + password + confirmation, no session.
2. `POST /auth/register` validates confirmation match → length ≥
   `SKP_PASSWORD_MIN_LENGTH` → email uniqueness ⇒ `409 EMAIL_TAKEN`. Rate limit 5/10 min.
3. Success writes a `users` row (own scrypt hash) and an `auth.register` audit
   entry (actor = target = new email), then the SPA returns to `/login`.
4. The new account signs in through the ordinary password login and sees the same
   masked/enveloped keys as every other member.

### Sensitive scope (reveal / delete / settings write / password change)

`POST /auth/verify-password` sets `sensitive_until = now + 5 min` on the session.
Guard rejects without it (`SENSITIVE_SCOPE_REQUIRED`). Password change revokes all
other sessions and rotates the current one.

## 3. Vault behaviour

- `resolveMasterKey()`: `SKP_VAULT_MASTER_KEY_FILE` (32 base64 bytes) → macOS
  keychain (`SecretKeyPreview.vault`, auto-created on first native run) →
  deterministic KDF over `SKP_VAULT_MASTER_PASSWORD` (containers/headless).
- `encryptSecret`: AES-256-GCM, 12-byte random IV, AAD `SecretKeyPreview.vault.v1`,
  16-byte tag; ciphertext/iv/tag stored separately. Tampering ⇒ decryption error ⇒ audit event.
- `maskSecret`: `head6` + 6 bullets + `tail4`; ≤10 chars fully masked.
- Reveal returns the value once with `expiresAt = now + 30 s`; UI auto-hides and warns.

## 4. Live verification (opt-in)

`Settings.verify_keys_opt_in` must be true. `probeProvider` sends one cheap GET with
the key, classifies the response:

| Provider response | Status                                            |
| ----------------- | ------------------------------------------------- |
| 200 / 404         | `valid` (endpoint reachable and accepted the key) |
| 401 / 403         | `invalid`                                         |
| 429               | `error` (rate limited)                            |
| other / network   | `error`                                           |

Providers with no safe endpoint return `error` with an explanatory detail.

## 5. Boundary conditions

| Condition                           | Behaviour                                                   |
| ----------------------------------- | ----------------------------------------------------------- |
| Missing source file                 | skipped silently (optional config)                          |
| File > 4 MiB or not regular         | skipped                                                     |
| Unparseable JSON/YAML/TOML          | 0 entries from that source, others continue                 |
| Placeholder/short/whitespace values | ignored                                                     |
| Duplicate value across sources      | single row, `last_seen_at` updated                          |
| Secret disappears                   | `status = 'removed'` + `key_events` row, kept in history    |
| Secret reappears                    | reactivated (`status = 'active'`)                           |
| Keychain locked                     | scan emits an error event and continues                     |
| Keychain metadata item              | no ciphertext; reveal returns an explanatory error          |
| Bootstrap when owner exists         | 409 `ALREADY_BOOTSTRAPPED`                                  |
| Google account not allow-listed     | 403 `GOOGLE_ACCOUNT_NOT_ALLOWED` + audit `denied`           |
| Concurrent scans                    | last trigger wins per run id; cancel aborts between sources |
| Data dir unwritable                 | startup fails fast with a clear error                       |

## 6. Failure & recovery

- Central error handler: `AppError`/`ZodError`/Fastify errors → typed envelope; anything
  else logs server-side (5xx) and returns `INTERNAL_ERROR` with a traceId.
- SQLite WAL + `foreign_keys=ON`; a failing migration rolls back inside a transaction.
- Rollback: `tsx src/infra/db/migrate.ts --down [n]` (each migration ships `down[]`).
