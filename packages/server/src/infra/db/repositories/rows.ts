export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface GoogleIdentityRow {
  user_id: string;
  google_sub: string;
  email: string;
  picture_url: string | null;
  linked_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  created_at: string;
  last_seen_at: string;
  idle_expires_at: string;
  absolute_expires_at: string;
  sensitive_until: string | null;
  revoked_at: string | null;
  ip_hash: string | null;
  user_agent_hash: string | null;
}

export interface OauthStateRow {
  state: string;
  code_verifier: string;
  nonce: string;
  created_at: string;
  consumed_at: string | null;
}

export interface ProviderRow {
  id: string;
  label: string;
  key_prefixes: string;
  env_hints: string;
  docs_url: string | null;
  created_at: string;
}

export interface SourceRow {
  id: string;
  kind: string;
  path: string;
  parser: string;
  provider_hint: string | null;
  enabled: number;
  priority: number;
  notes: string | null;
  created_at: string;
}

export interface ScanRunRow {
  id: string;
  status: string;
  trigger_kind: string;
  started_at: string;
  finished_at: string | null;
  source_count: number;
  new_count: number;
  updated_count: number;
  removed_count: number;
  total_count: number;
  error_code: string | null;
}

export interface ApiKeyRow {
  id: string;
  provider: string;
  /** Evidence label that named the provider; see `Evidence`. */
  provider_evidence: string;
  label: string | null;
  masked_value: string;
  fingerprint: string;
  cipher_text: string | null;
  iv: string | null;
  auth_tag: string | null;
  source_kind: string;
  source_path: string;
  source_pointer: string | null;
  env_var_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
  source_mtime: string | null;
  last_verified_at: string | null;
  verification_status: string;
  status: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface KeySourceRow {
  key_id: string;
  source_kind: string;
  source_path: string;
  source_pointer: string;
  env_var_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface KeyEventRow {
  id: string;
  key_id: string | null;
  type: string;
  at: string;
  actor: string;
  note: string | null;
}

export interface AuditLogRow {
  id: string;
  trace_id: string;
  actor: string;
  action: string;
  target: string | null;
  outcome: string;
  detail: string | null;
  at: string;
}

export interface SettingsRow {
  id: number;
  google_allowed_emails: string;
  session_idle_minutes: number;
  session_absolute_hours: number;
  verify_keys_opt_in: number;
  scan_root: string;
  updated_at: string;
}

export interface LoginAttemptRow {
  id: string;
  email: string;
  ip_hash: string;
  at: string;
  ok: number;
}
