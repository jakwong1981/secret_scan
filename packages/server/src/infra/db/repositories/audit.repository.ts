import type { Db } from "../database.js";
import type { AuditLogRow } from "./rows.js";
import { newId } from "../../ids.js";

export interface AuditInput {
  traceId: string;
  actor: string;
  action: string;
  target?: string;
  outcome: "success" | "denied" | "error";
  detail?: string;
}

export function recordAudit(db: Db, input: AuditInput): void {
  db.prepare(
    `INSERT INTO audit_logs (id, trace_id, actor, action, target, outcome, detail, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    input.traceId,
    input.actor,
    input.action,
    input.target ?? null,
    input.outcome,
    input.detail ?? null,
    new Date().toISOString(),
  );
}

export function listAudit(db: Db, limit: number, offset: number): AuditLogRow[] {
  return db.prepare("SELECT * FROM audit_logs ORDER BY at DESC LIMIT ? OFFSET ?").all(limit, offset) as unknown as AuditLogRow[];
}

export function countAudit(db: Db): number {
  const row = db.prepare("SELECT COUNT(*) AS total FROM audit_logs").get() as unknown as { total: number };
  return Number(row.total);
}
