import type { MaskedKey } from "@skp/contracts";
import type { ApiKeyRow, KeyEventRow } from "../../infra/db/repositories/rows.js";
import type { KeyEvent } from "@skp/contracts";

export function toMaskedKey(row: ApiKeyRow, providerLabel: string): MaskedKey {
  return {
    id: row.id,
    provider: row.provider,
    providerLabel,
    label: row.label ?? undefined,
    maskedValue: row.masked_value,
    fingerprint: row.fingerprint,
    sourceKind: row.source_kind as MaskedKey["sourceKind"],
    sourcePath: row.source_path,
    sourcePointer: row.source_pointer ?? undefined,
    envVarName: row.env_var_name ?? undefined,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    sourceMtime: row.source_mtime ?? undefined,
    lastVerifiedAt: row.last_verified_at ?? undefined,
    verificationStatus: row.verification_status as MaskedKey["verificationStatus"],
    status: row.status as MaskedKey["status"],
  };
}

export function toKeyEvent(row: KeyEventRow): KeyEvent {
  return {
    id: row.id,
    type: row.type as KeyEvent["type"],
    at: row.at,
    actor: row.actor,
    note: row.note ?? undefined,
  };
}

export function safeParseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}
