import type { AuditEntry } from "@skp/contracts";
import type { AuditLogRow } from "../../infra/db/repositories/rows.js";

export function toAuditEntry(row: AuditLogRow): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    traceId: row.trace_id,
    actor: row.actor,
    action: row.action,
    target: row.target ?? undefined,
    outcome: row.outcome as AuditEntry["outcome"],
    detail: row.detail ?? undefined,
  };
}
