import type { Db } from "../database.js";
import type { ApiKeyRow, KeyEventRow } from "./rows.js";
import { newId } from "../../ids.js";
import { maskSecret } from "../../../core/crypto/mask.js";
import { fingerprint } from "../../../core/crypto/password.js";
import { encryptSecret, decryptSecret, type CipherEnvelope } from "../../../core/crypto/vault.js";

export interface KeyCandidateInput {
  provider: string;
  label?: string;
  value?: string;
  sourceKind: string;
  sourcePath: string;
  sourcePointer?: string;
  envVarName?: string;
  sourceMtime?: number;
}

export interface KeyUpsertResult {
  id: string;
  isNew: boolean;
  fingerprint: string;
}

export function upsertFromCandidate(db: Db, input: KeyCandidateInput): KeyUpsertResult {
  const now = new Date().toISOString();
  const isKeychainMetadata = input.value === undefined || input.value === null;
  const fingerprintValue = isKeychainMetadata
    ? fingerprint(`keychain:${input.sourcePath}:${input.sourcePointer ?? ""}`)
    : fingerprint(input.value as string);

  const existing = db.prepare("SELECT * FROM api_keys WHERE fingerprint = ?").get(fingerprintValue) as unknown as ApiKeyRow | null;

  if (existing) {
    db.prepare(
      `UPDATE api_keys
          SET last_seen_at = ?,
              source_path = ?,
              source_pointer = ?,
              source_kind = ?,
              env_var_name = COALESCE(?, env_var_name),
              source_mtime = COALESCE(?, source_mtime),
              status = 'active',
              updated_at = ?
        WHERE id = ?`,
    ).run(
      now,
      input.sourcePath,
      input.sourcePointer ?? existing.source_pointer,
      input.sourceKind,
      input.envVarName ?? null,
      input.sourceMtime ? new Date(input.sourceMtime).toISOString() : null,
      now,
      existing.id,
    );
    return { id: existing.id, isNew: false, fingerprint: fingerprintValue };
  }

  const envelope: CipherEnvelope | null = isKeychainMetadata
    ? null
    : encryptSecret(input.value as string);

  const id = newId();
  db.prepare(
    `INSERT INTO api_keys (id, provider, label, masked_value, fingerprint, cipher_text, iv, auth_tag,
       source_kind, source_path, source_pointer, env_var_name, first_seen_at, last_seen_at, source_mtime,
       verification_status, status, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', 'active', '[]', ?, ?)`,
  ).run(
    id,
    input.provider,
    input.label ?? null,
    isKeychainMetadata ? "•••• macOS Keychain item" : maskSecret(input.value as string),
    fingerprintValue,
    envelope?.cipherText ?? null,
    envelope?.iv ?? null,
    envelope?.authTag ?? null,
    input.sourceKind,
    input.sourcePath,
    input.sourcePointer ?? null,
    input.envVarName ?? null,
    now,
    now,
    input.sourceMtime ? new Date(input.sourceMtime).toISOString() : null,
    now,
    now,
  );

  db.prepare(
    "INSERT INTO key_events (id, key_id, type, at, actor, note) VALUES (?, ?, 'discovered', ?, 'scan', ?)",
  ).run(newId(), id, now, `found in ${input.sourcePath}`);

  return { id, isNew: true, fingerprint: fingerprintValue };
}

/** Marks every active key that was not seen during a run as `removed`. */
export function markUnseenAsRemoved(db: Db, seenFingerprints: string[], actor = "scan"): number {
  const active = db.prepare("SELECT id, fingerprint FROM api_keys WHERE status = 'active'").all() as unknown as Array<{
    id: string;
    fingerprint: string;
  }>;
  const seen = new Set(seenFingerprints);
  const stale = active.filter((row) => !seen.has(row.fingerprint));
  for (const row of stale) {
    db.prepare("UPDATE api_keys SET status = 'removed', updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      row.id,
    );
    db.prepare(
      "INSERT INTO key_events (id, key_id, type, at, actor, note) VALUES (?, ?, 'removed', ?, ?, ?)",
    ).run(newId(), row.id, new Date().toISOString(), actor, "no longer present in source");
  }
  return stale.length;
}

export interface KeyListFilter {
  provider?: string;
  status?: string;
  sourceKind?: string;
  search?: string;
  limit: number;
  offset: number;
  sort: "date_added" | "provider" | "last_seen";
}

export function countKeys(db: Db, filter: Omit<KeyListFilter, "limit" | "offset" | "sort">): number {
  const { where, params } = buildFilter(filter);
  const row = db.prepare(`SELECT COUNT(*) AS total FROM api_keys k ${where}`).get(...params) as {
    total: number;
  };
  return Number(row.total);
}

export function listKeys(db: Db, filter: KeyListFilter): ApiKeyRow[] {
  const { where, params } = buildFilter({ ...filter });
  const order =
    filter.sort === "date_added"
      ? "ORDER BY COALESCE(k.source_mtime, k.first_seen_at) DESC"
      : filter.sort === "provider"
        ? "ORDER BY k.provider ASC, k.first_seen_at DESC"
        : "ORDER BY k.last_seen_at DESC";
  const sql = `SELECT k.*, p.label AS provider_label FROM api_keys k
                 LEFT JOIN providers p ON p.id = k.provider
                 ${where} ${order} LIMIT ? OFFSET ?`;
  return db.prepare(sql).all(...params, filter.limit, filter.offset) as unknown as ApiKeyRow[];
}

function buildFilter(filter: Omit<KeyListFilter, "limit" | "offset" | "sort">) {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filter.provider) {
    clauses.push("k.provider = ?");
    params.push(filter.provider);
  }
  if (filter.status) {
    clauses.push("k.status = ?");
    params.push(filter.status);
  }
  if (filter.sourceKind) {
    clauses.push("k.source_kind = ?");
    params.push(filter.sourceKind);
  }
  if (filter.search) {
    clauses.push("(k.source_path LIKE ? OR k.provider LIKE ? OR COALESCE(k.label,'') LIKE ?)");
    params.push(`%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
}

export function findKeyById(db: Db, id: string): ApiKeyRow | null {
  const row = db
    .prepare(
      `SELECT k.*, p.label AS provider_label FROM api_keys k
         LEFT JOIN providers p ON p.id = k.provider WHERE k.id = ?`,
    )
    .get(id);
  return (row as unknown as ApiKeyRow | null) ?? null;
}

export function decryptKeyValue(row: ApiKeyRow): string {
  if (row.cipher_text === null || row.iv === null || row.auth_tag === null) {
    return "";
  }
  return decryptSecret({ cipherText: row.cipher_text, iv: row.iv, authTag: row.auth_tag });
}

export function listKeyEvents(db: Db, keyId: string): KeyEventRow[] {
  return db
    .prepare("SELECT * FROM key_events WHERE key_id = ? ORDER BY at DESC LIMIT 100")
    .all(keyId) as unknown as KeyEventRow[];
}

export function recordKeyEvent(
  db: Db,
  input: { keyId: string; type: string; actor: string; note?: string },
): void {
  db.prepare("INSERT INTO key_events (id, key_id, type, at, actor, note) VALUES (?, ?, ?, ?, ?, ?)").run(
    newId(),
    input.keyId,
    input.type,
    new Date().toISOString(),
    input.actor,
    input.note ?? null,
  );
}

export function updateKey(
  db: Db,
  id: string,
  input: { label?: string; tags?: string[]; status?: string },
): void {
  const assignments: string[] = [];
  const params: Array<string | number> = [];
  if (input.label !== undefined) {
    assignments.push("label = ?");
    params.push(input.label);
  }
  if (input.tags !== undefined) {
    assignments.push("tags = ?");
    params.push(JSON.stringify(input.tags));
  }
  if (input.status !== undefined) {
    assignments.push("status = ?");
    params.push(input.status);
  }
  assignments.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);
  db.prepare(`UPDATE api_keys SET ${assignments.join(", ")} WHERE id = ?`).run(...params);
}

export function deleteKey(db: Db, id: string): void {
  db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
}

export function setVerification(
  db: Db,
  id: string,
  status: string,
  detail: string | undefined,
  actor = "owner",
): void {
  const now = new Date().toISOString();
  db.prepare("UPDATE api_keys SET verification_status = ?, last_verified_at = ?, updated_at = ? WHERE id = ?").run(
    status,
    now,
    now,
    id,
  );
  db.prepare("INSERT INTO key_events (id, key_id, type, at, actor, note) VALUES (?, ?, 'verified', ?, ?, ?)").run(
    newId(),
    id,
    now,
    actor,
    detail ?? status,
  );
}

export function countByProvider(db: Db): Array<{ provider: string; total: number }> {
  return db
    .prepare("SELECT provider, COUNT(*) AS total FROM api_keys WHERE status != 'removed' GROUP BY provider ORDER BY total DESC")
    .all() as unknown as Array<{ provider: string; total: number }>;
}
