# Functional Specification — SecretKeyPreview

## 1. Discovery pipeline

```
load enabled sources (sources table, seeded from infra/scanner/source-registry.ts)
  → per source:
      file:    stat (≤4 MiB, regular file) → readFileSync → parser
      env-file: dotenv parser
      keychain: security dump-keychain metadata scan (darwin only, switchable)
  → parser emits ParsedEntry { pointer, keyName, value }
      json (JSONC tolerant) · yaml · toml · dotenv · raw-regex
  → filter: key name matches credential regex, value ≥8 chars, no whitespace,
            not a placeholder (changeme, ..., <...>)
  → classifyProvider() → provider id
  → fingerprint = sha256(value) (or sha256("keychain:path:pointer"))
  → upsert api_keys (encrypt new values; update last_seen/source/mtime)
  → run summary + SSE progress events
  → afterwards: active keys not seen this run → status = 'removed' + event
```

### Classification precedence
1. Value prefix (longest match; bare `sk-` excluded because OpenAI/Bailian share it).
2. Env-var / keychain name hints (`ANTHROPIC_API_KEY`, `DASHSCOPE_API_KEY`, …).
3. The scan source's provider hint (weak default for that file).
4. Provider name embedded in the key name.
5. `unknown` (still stored so the owner can triage).

### Registry highlights (verified on the development Mac)
`~/.codex/auth.json|config.toml`, `~/.grok/auth.json|config.toml`,
`~/.bailian/config.json`, `~/.arkcli-bp/config.yaml|.env`,
`~/.gemini/{oauth_creds,google_accounts,settings}.json`, `~/.copilot/config.json`,
`~/.cursor/{cli-config,mcp}.json`, `~/.deepseek/token/*`, `~/.qwen/settings.json`,
`~/.continue/{config.yaml,.continuerc.json}`, `~/.config/opencode/{opencode.jsonc,auth.json}`,
`~/.ollama/config.json`, `~/.claude/session-env/*`, `~/.claude.json`,
`~/.config/colab-cli/token.json`, `~/.docker/config.json`, `~/.config/configstore/*`,
`~/.npmrc`, `~/.zshrc|.zprofile|.bash_profile|.profile`,
`~/.aws/{credentials,config}` (opt-in), `~/.git-credentials` (opt-in),
`keychain:login:generic-password` (metadata only).

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

| Provider response | Status |
|---|---|
| 200 / 404 | `valid` (endpoint reachable and accepted the key) |
| 401 / 403 | `invalid` |
| 429 | `error` (rate limited) |
| other / network | `error` |

Providers with no safe endpoint return `error` with an explanatory detail.

## 5. Boundary conditions

| Condition | Behaviour |
|---|---|
| Missing source file | skipped silently (optional config) |
| File > 4 MiB or not regular | skipped |
| Unparseable JSON/YAML/TOML | 0 entries from that source, others continue |
| Placeholder/short/whitespace values | ignored |
| Duplicate value across sources | single row, `last_seen_at` updated |
| Secret disappears | `status = 'removed'` + `key_events` row, kept in history |
| Secret reappears | reactivated (`status = 'active'`) |
| Keychain locked | scan emits an error event and continues |
| Keychain metadata item | no ciphertext; reveal returns an explanatory error |
| Bootstrap when owner exists | 409 `ALREADY_BOOTSTRAPPED` |
| Google account not allow-listed | 403 `GOOGLE_ACCOUNT_NOT_ALLOWED` + audit `denied` |
| Concurrent scans | last trigger wins per run id; cancel aborts between sources |
| Data dir unwritable | startup fails fast with a clear error |

## 6. Failure & recovery

- Central error handler: `AppError`/`ZodError`/Fastify errors → typed envelope; anything
  else logs server-side (5xx) and returns `INTERNAL_ERROR` with a traceId.
- SQLite WAL + `foreign_keys=ON`; a failing migration rolls back inside a transaction.
- Rollback: `tsx src/infra/db/migrate.ts --down [n]` (each migration ships `down[]`).
