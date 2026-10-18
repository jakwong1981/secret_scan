# Diagrams — SecretKeyPreview

All diagrams render with Mermaid.js.

## 1. End-to-end sequence (bootstrap → scan → reveal)

```mermaid
sequenceDiagram
    autonumber
    participant O as Owner (React SPA)
    participant API as Fastify /api/v1
    participant AUTH as auth service
    participant VAULT as vault (AES-256-GCM)
    participant SCAN as scanner service
    participant FS as macOS FS + Keychain
    participant DB as SQLite

    O->>API: GET /auth/status
    API-->>O: { needsBootstrap: true }
    O->>API: POST /auth/bootstrap {email, masterPassword}
    API->>AUTH: bootstrap
    AUTH->>DB: INSERT users (scrypt hash) + sessions
    API-->>O: 200 Set-Cookie skp_session

    O->>API: POST /scans
    API->>SCAN: start(trigger=manual)
    SCAN->>DB: INSERT scan_runs (running)
    loop per source
        SCAN->>FS: read-only read
        FS-->>SCAN: text / metadata
        SCAN->>SCAN: parse + classify + fingerprint
        SCAN->>VAULT: encryptSecret(value)
        VAULT-->>SCAN: cipher+iv+tag
        SCAN->>DB: upsert api_keys (+ key_events)
    end
    SCAN->>DB: markUnseenAsRemoved
    SCAN->>DB: completeScanRun
    SCAN-->>API: SSE progress events
    API-->>O: 202 { counts }

    O->>API: GET /keys?sort=date_added
    API->>DB: SELECT api_keys (+ provider label)
    DB-->>API: rows (masked only)
    API-->>O: 200 list

    O->>API: POST /auth/verify-password
    API->>DB: sessions.sensitive_until = now+5m
    API-->>O: 200

    O->>API: POST /keys/:id/reveal
    API->>VAULT: decryptSecret
    VAULT-->>API: plaintext (30 s TTL)
    API->>DB: key_events(revealed) + audit_logs
    API-->>O: 200 { value, expiresAt }
```

## 2. Component / class hierarchy

```mermaid
flowchart TD
    subgraph web["packages/web (React 19 + Vite)"]
        App[App.tsx] --> Shell[components/AppShell.tsx]
        App --> Login[features/LoginPage.tsx]
        App --> Dash[features/DashboardPage.tsx]
        App --> Detail[features/KeyDetailPage.tsx]
        Dash --> KeyTable[inline table + filters]
        Detail --> Reauth[hooks/useReauth.ts]
        web -. imports types .-> Contracts
        ApiClient[api/client.ts] --> Contracts
    end

    subgraph contracts["packages/contracts"]
        Contracts[schemas.ts zod + inferred types]
    end

    subgraph server["packages/server (Fastify + node:sqlite)"]
        App2[app.ts buildApp] --> Guard[plugins/auth-guard.ts]
        App2 --> Err[core/errors/error-handler.ts]
        App2 --> Routes["modules/*/routes.ts"]
        Routes --> Svc["modules/*/service.ts"]
        Svc --> Repos["infra/db/repositories/*.ts"]
        Svc --> Crypto["core/crypto/{vault,password,google-id-token,mask}.ts"]
        Svc --> ScanSvc[modules/scans/service.ts]
        ScanSvc --> Scanner["infra/scanner/scanner.ts"]
        Scanner --> Parsers[infra/scanner/parsers.ts]
        Scanner --> Registry[infra/scanner/{source-registry,provider-registry}.ts]
        Repos --> DB[(SQLite)]
        Repos --> Mig[infra/db/migrations + seed.ts]
    end

    Contracts -.-> server
```

## 3. Key lifecycle state transition

```mermaid
stateDiagram-v2
    [*] --> Discovered: scan finds value
    Discovered --> Active: stored (envelope encrypted)
    Active --> Verified: probe says valid
    Verified --> Invalid: probe says 401/403
    Invalid --> Verified: probe says valid again
    Active --> Removed: no longer in any source
    Removed --> Active: source reappears
    Active --> Archived: owner archives
    Archived --> Active
    Active --> Deleted: owner deletes (sensitive scope)
    Invalid --> Deleted
    Removed --> Deleted
    Deleted --> [*]

    note right of Verified
        every transition writes a key_events row
    end note
```

## 4. Scan run state transition

```mermaid
stateDiagram-v2
    [*] --> Running: POST /scans creates run
    Running --> Completed: all sources processed
    Running --> Failed: fatal error (e.g. data dir unwritable)
    Running --> Canceled: POST /scans/:id/cancel (abort between sources)
    Completed --> [*]
    Failed --> [*]
    Canceled --> [*]
    note right of Running
        per-source failures emit an error event
        and do NOT fail the whole run
    end note
```

## 5. Deployment topology (native + Docker)

```mermaid
flowchart TB
    subgraph mac["macOS host (owner)"]
        Browser["browser https://127.0.0.1:5173 (dev) / :4173 (prod)"]
        subgraph native["native mode"]
            Node["node dist/main.js<br/>node:https TLS 1.3"]
        end
        subgraph docker["docker mode"]
            App["app container<br/>node:22-bookworm-slim uid 10001<br/>read-only rootfs"]
            Vol[("skp-data volume<br/>SQLite + WAL")]
            KeyFile["secret file vault_master_key"]
            CertMount["bind mount ./certs"]
            ScanMount["bind mount $HOME → /scan (ro)"]
        end
    end
    Browser --> Node
    Browser --> App
    App --> Vol
    App --> KeyFile
    App --> CertMount
    App --> ScanMount
    Optional["optional profile tls: nginx-tls 127.0.0.1:8443"] -.->|https upstream| App
    Browser -.->|only when profile tls enabled| Optional
```
