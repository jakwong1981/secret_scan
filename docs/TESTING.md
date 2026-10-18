# Testing Document — SecretKeyPreview

## 1. Inventory & commands

| Suite | Location | Runner | Count |
|---|---|---|---|
| Server unit | `packages/server/test/unit/*` | Vitest | 30 |
| Server integration | `packages/server/test/integration/api.test.ts` | Vitest + `app.inject` | 4 |
| Frontend | `packages/web/src/test/*` | Vitest + React Testing Library | 5 |
| Smoke | `scripts/scan-check.sh` | bash + curl (+ synthetic fixtures) | 7 checks |

**Total: 34 server tests + 5 frontend tests + smoke checks.**

```bash
pnpm test                    # all suites
pnpm --filter @skp/server test
pnpm --filter @skp/web test
./scripts/scan-check.sh      # boots the server against fixture data
pnpm lint && pnpm typecheck
```

Standards honoured: AAA structure, one concept per test, external dependencies
(fetch, keychain, `security` CLI) either avoided or stubbed, error paths covered,
no real credentials in fixtures.

## 2. Unit test cases

### crypto (`test/unit/crypto.test.ts`)
| ID | Case | Assertion |
|---|---|---|
| CR-01 | `hashPassword` twice | same input ⇒ different hash (unique salt) |
| CR-02 | verify correct/incorrect | `true` / `false` |
| CR-03 | `maskSecret` long/short | `sk-ant••••••wXyZ` / fully masked |
| CR-04 | vault round-trip | decrypt(encrypt(x)) === x |
| CR-05 | fresh IV per encryption | `iv` differs for identical input |
| CR-06 | tampered ciphertext | throws (GCM auth tag) |
| CR-07 | fingerprint stable | 64-char sha256 hex, differs per value |

### parsers (`test/unit/parsers.test.ts`)
| ID | Case | Assertion |
|---|---|---|
| PA-01 | JSON nested + pointer | 2 entries, `nested.providers[0].api_key` |
| PA-02 | JSONC comments/trailing commas | parsed |
| PA-03 | placeholders/short values | ignored |
| PA-04 | YAML list | 1 entry with `models[0].apiKey` |
| PA-05 | TOML table | 1 entry with `providers.openai.api_key` |
| PA-06 | dotenv `export`, quoted | 2 entries, comments skipped |
| PA-07 | raw regex anywhere in file | value found |
| PA-08 | raw dedupe | repeated value stored once |

### classifier (`test/unit/classifier.test.ts`)
| ID | Case | Assertion |
|---|---|---|
| CL-01 | prefixes authoritative | anthropic / hf / ghp / AIza |
| CL-02 | env hint beats disputed `sk-` | DASHSCOPE_API_KEY ⇒ bailian |
| CL-03 | source hint respected | byteplus-ark |
| CL-04 | strong prefix beats source hint | `sk-ant-…` ⇒ anthropic even with hint |
| CL-05 | bare `sk-` + source hint | bailian |
| CL-06 | no evidence | unknown |

### scanner (`test/unit/scanner.test.ts`)
| ID | Case | Assertion |
|---|---|---|
| SC-01 | full run over fixture home | 3 keys, correct providers, evidence, mtime, decrypt == source value |
| SC-02 | same value in 2 files | second run `newCount === 0` |
| SC-03 | secret deleted | `removedCount === 1`, status `removed` |
| SC-04 | missing source | run still completes |
| SC-05 | aborted signal | status `canceled` |
| SC-06 | secret reappears | row reactivated |
| SC-07 | `markUnseenAsRemoved` all seen | 0 |

### integration (`test/integration/api.test.ts`)
| ID | Case | Assertion |
|---|---|---|
| AI-01 | health | 200, `data.tls === true`, traceId present |
| AI-02 | unauthenticated routes | 401 `UNAUTHENTICATED` for keys/scans/settings/audit/sources |
| AI-03 | full flow | status → bootstrap → 409 duplicate → bad login → good login → scan → keys (provider, masked) → reveal blocked → re-auth → reveal equals secret → detail events include `revealed` → patch → delete → audit contains the actions → logout → 401 |
| AI-04 | unknown API route | 404 `NOT_FOUND` |

### frontend (`packages/web/src/test`)
| ID | Case | Assertion |
|---|---|---|
| FE-01 | fresh install login page | bootstrap form rendered |
| FE-02 | password sign-in | `api.auth.login` called with payload |
| FE-03 | API error surfaced | alert shows `Invalid credentials` |
| FE-04 | dashboard rows | masked keys, provider, source title, status badges |
| FE-05 | dashboard counters | summary cards render |

## 3. Functional test matrix

| Test Case ID | Scenario | Preconditions | Input Payload | Expected Status & Response | Pass/Fail Criteria |
|---|---|---|---|---|---|
| FT-01 | First-run bootstrap | empty DB | `POST /auth/bootstrap {owner@example.com, "…12+ chars"}` | 200 + `Set-Cookie: skp_session` | `users` row with scrypt hash (no plaintext) |
| FT-02 | Duplicate bootstrap | owner exists | same payload | 409 `ALREADY_BOOTSTRAPPED` | no second user created |
| FT-03 | Login wrong password 5× | owner exists | bad password ×5 | 401 ×4 then 429 `RATE_LIMITED` | `login_attempts` rows recorded |
| FT-04 | Login correct | owner exists | valid payload | 200 + cookie | session row usable |
| FT-05 | Session idle expiry | idle 30 min | request after timeout | 401 `UNAUTHENTICATED` | session not reused |
| FT-06 | Google allowed account | OAuth configured, allow-listed | consent flow | 200 + HTML postMessage page | `google_identities` row + session |
| FT-07 | Google not allowed | OAuth configured | non-allowlisted account | 400 HTML + audit `denied` | no session issued |
| FT-08 | Scan native Mac | sources enabled | `POST /scans` | 202, counts > 0 | providers match known prefixes |
| FT-09 | Keychain scan | darwin, `SKP_KEYCHAIN_SCAN=true` | `POST /scans` | metadata rows created | no secret bytes read |
| FT-10 | Reveal without scope | session only | `POST /keys/:id/reveal` | 401/403 `SENSITIVE_SCOPE_REQUIRED` | no ciphertext returned |
| FT-11 | Reveal after re-auth | sensitive scope | reveal | 200 value | value equals source secret |
| FT-12 | Verify valid key | opt-in enabled, real key | verify | 200 `valid` | provider accepted the request |
| FT-13 | Verify invalid key | opt-in enabled, revoked key | verify | 200 `invalid` | `verification_status` persisted |
| FT-14 | Delete key | sensitive scope | `DELETE /keys/:id` | 200 | row gone, `deleted` event exists |
| FT-15 | Archive key | session | `PATCH {status:"archived"}` | 200 | status persisted |
| FT-16 | Add custom source | sensitive scope | `POST /sources {path, parser}` | 201 | next scan uses it |
| FT-17 | Disable source | session | `PATCH /sources/:id {enabled:false}` | 200 | source skipped |
| FT-18 | Update allow-list | sensitive scope | `PUT /settings` | 200 | next Google login honours it |
| FT-19 | Change master password | sensitive scope | `POST /auth/change-password` | 200 | old password fails, other sessions revoked |
| FT-20 | TLS enforcement | server running | `curl http://…` (no listener) / `curl -k https://…` | no plaintext route / 200 | `SKP_ENABLE_HTTP_REDIRECT=false` by default |
| FT-21 | Cookie flags | signed in | inspect cookie | `HttpOnly; Secure; SameSite=Strict; Path=/` | browser sends cookie over HTTPS only |
| FT-22 | SSE progress | scan running | `GET /scans/:id/events` | `text/event-stream` frames | UI progress bar advances |
| FT-23 | Docker deployment | compose up | `./scripts/deploy.sh local` | container healthy on 127.0.0.1:4173 | logs contain no secrets, DB persists in volume |
| FT-24 | Log redaction | reveal performed | grep logs for key material | no matches | pino redaction works |

## 4. Non-functional checks

- `pnpm typecheck` — strict TS, `noUncheckedIndexedAccess`, no `any` (lint rule).
- `pnpm lint` — `no-console`, `consistent-type-imports`, `eqeqeq`.
- `pnpm build` — web bundle + server dist emit cleanly.
- `scripts/scan-check.sh` asserts masked values never leak into API payloads.
