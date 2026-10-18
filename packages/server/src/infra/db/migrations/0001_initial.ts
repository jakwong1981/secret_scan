import type { Migration } from "./types.js";

const UP = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY NOT NULL,
     email TEXT NOT NULL UNIQUE,
     password_hash TEXT,
     created_at TEXT NOT NULL,
     last_login_at TEXT
   )`,

  `CREATE TABLE google_identities (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     google_sub TEXT NOT NULL,
     email TEXT NOT NULL,
     picture_url TEXT,
     linked_at TEXT NOT NULL,
     PRIMARY KEY (user_id, google_sub)
   )`,

  `CREATE TABLE sessions (
     id TEXT PRIMARY KEY NOT NULL,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL,
     last_seen_at TEXT NOT NULL,
     idle_expires_at TEXT NOT NULL,
     absolute_expires_at TEXT NOT NULL,
     sensitive_until TEXT,
     revoked_at TEXT,
     ip_hash TEXT,
     user_agent_hash TEXT
   )`,

  `CREATE INDEX idx_sessions_user ON sessions(user_id)`,

  `CREATE TABLE oauth_states (
     state TEXT PRIMARY KEY NOT NULL,
     code_verifier TEXT NOT NULL,
     nonce TEXT NOT NULL,
     created_at TEXT NOT NULL,
     consumed_at TEXT
   )`,

  `CREATE TABLE providers (
     id TEXT PRIMARY KEY NOT NULL,
     label TEXT NOT NULL,
     key_prefixes TEXT NOT NULL,
     env_hints TEXT NOT NULL,
     docs_url TEXT,
     created_at TEXT NOT NULL
   )`,

  `CREATE TABLE sources (
     id TEXT PRIMARY KEY NOT NULL,
     kind TEXT NOT NULL,
     path TEXT NOT NULL,
     parser TEXT NOT NULL,
     provider_hint TEXT,
     enabled INTEGER NOT NULL DEFAULT 1,
     priority INTEGER NOT NULL DEFAULT 100,
     notes TEXT,
     created_at TEXT NOT NULL
   )`,

  `CREATE TABLE scan_runs (
     id TEXT PRIMARY KEY NOT NULL,
     status TEXT NOT NULL,
     trigger_kind TEXT NOT NULL,
     started_at TEXT NOT NULL,
     finished_at TEXT,
     source_count INTEGER NOT NULL DEFAULT 0,
     new_count INTEGER NOT NULL DEFAULT 0,
     updated_count INTEGER NOT NULL DEFAULT 0,
     removed_count INTEGER NOT NULL DEFAULT 0,
     total_count INTEGER NOT NULL DEFAULT 0,
     error_code TEXT
   )`,

  `CREATE INDEX idx_scan_runs_started ON scan_runs(started_at DESC)`,

  `CREATE TABLE api_keys (
     id TEXT PRIMARY KEY NOT NULL,
     provider TEXT NOT NULL,
     label TEXT,
     masked_value TEXT NOT NULL,
     fingerprint TEXT NOT NULL UNIQUE,
     cipher_text TEXT,
     iv TEXT,
     auth_tag TEXT,
     source_kind TEXT NOT NULL,
     source_path TEXT NOT NULL,
     source_pointer TEXT,
     env_var_name TEXT,
     first_seen_at TEXT NOT NULL,
     last_seen_at TEXT NOT NULL,
     source_mtime TEXT,
     last_verified_at TEXT,
     verification_status TEXT NOT NULL DEFAULT 'unknown',
     status TEXT NOT NULL DEFAULT 'active',
     tags TEXT NOT NULL DEFAULT '[]',
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,

  `CREATE INDEX idx_api_keys_provider ON api_keys(provider)`,
  `CREATE INDEX idx_api_keys_status ON api_keys(status)`,

  `CREATE TABLE key_events (
     id TEXT PRIMARY KEY NOT NULL,
     key_id TEXT REFERENCES api_keys(id) ON DELETE CASCADE,
     type TEXT NOT NULL,
     at TEXT NOT NULL,
     actor TEXT NOT NULL,
     note TEXT
   )`,

  `CREATE INDEX idx_key_events_key ON key_events(key_id, at DESC)`,

  `CREATE TABLE audit_logs (
     id TEXT PRIMARY KEY NOT NULL,
     trace_id TEXT NOT NULL,
     actor TEXT NOT NULL,
     action TEXT NOT NULL,
     target TEXT,
     outcome TEXT NOT NULL,
     detail TEXT,
     at TEXT NOT NULL
   )`,

  `CREATE INDEX idx_audit_logs_at ON audit_logs(at DESC)`,

  `CREATE TABLE settings (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     google_allowed_emails TEXT NOT NULL DEFAULT '[]',
     session_idle_minutes INTEGER NOT NULL DEFAULT 30,
     session_absolute_hours INTEGER NOT NULL DEFAULT 12,
     verify_keys_opt_in INTEGER NOT NULL DEFAULT 0,
     scan_root TEXT NOT NULL DEFAULT '/',
     updated_at TEXT NOT NULL
   )`,

  `CREATE TABLE login_attempts (
     id TEXT PRIMARY KEY NOT NULL,
     email TEXT NOT NULL,
     ip_hash TEXT NOT NULL,
     at TEXT NOT NULL,
     ok INTEGER NOT NULL
   )`,

  `CREATE INDEX idx_login_attempts_email ON login_attempts(email, at DESC)`,
];

const DOWN = [
  "DROP TABLE IF EXISTS login_attempts",
  "DROP TABLE IF EXISTS settings",
  "DROP TABLE IF EXISTS audit_logs",
  "DROP TABLE IF EXISTS key_events",
  "DROP TABLE IF EXISTS api_keys",
  "DROP TABLE IF EXISTS scan_runs",
  "DROP TABLE IF EXISTS sources",
  "DROP TABLE IF EXISTS providers",
  "DROP TABLE IF EXISTS oauth_states",
  "DROP TABLE IF EXISTS sessions",
  "DROP TABLE IF EXISTS google_identities",
  "DROP TABLE IF EXISTS users",
];

export const initial: Migration = { id: "0001_initial", up: UP, down: DOWN };
