import type { Db } from "../database.js";
import type { ScanRunRow } from "./rows.js";
import { newId } from "../../ids.js";

export function createScanRun(
  db: Db,
  input: { triggerKind: string; sourceCount: number; runId?: string },
): ScanRunRow {
  const id = input.runId ?? newId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO scan_runs (id, status, trigger_kind, started_at, source_count)
     VALUES (?, 'running', ?, ?, ?)`,
  ).run(id, input.triggerKind, now, input.sourceCount);
  const created = findScanRunById(db, id);
  if (!created) throw new Error("failed to create scan run");
  return created;
}

export function findScanRunById(db: Db, id: string): ScanRunRow | null {
  const row = db.prepare("SELECT * FROM scan_runs WHERE id = ?").get(id);
  return (row as unknown as ScanRunRow | null) ?? null;
}

export function listScanRuns(
  db: Db,
  limit: number,
  offset: number,
): ScanRunRow[] {
  return db
    .prepare(
      "SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT ? OFFSET ?",
    )
    .all(limit, offset) as unknown as ScanRunRow[];
}

export function countScanRuns(db: Db): number {
  const row = db
    .prepare("SELECT COUNT(*) AS total FROM scan_runs")
    .get() as unknown as { total: number };
  return Number(row.total);
}

export function completeScanRun(
  db: Db,
  id: string,
  counts: {
    newCount: number;
    updatedCount: number;
    removedCount: number;
    totalCount: number;
  },
): void {
  db.prepare(
    `UPDATE scan_runs
        SET status = 'completed', finished_at = ?, new_count = ?, updated_count = ?, removed_count = ?, total_count = ?
      WHERE id = ?`,
  ).run(
    new Date().toISOString(),
    counts.newCount,
    counts.updatedCount,
    counts.removedCount,
    counts.totalCount,
    id,
  );
}

export function failScanRun(db: Db, id: string, errorCode: string): void {
  db.prepare(
    "UPDATE scan_runs SET status = 'failed', finished_at = ?, error_code = ? WHERE id = ?",
  ).run(new Date().toISOString(), errorCode, id);
}

export function cancelScanRun(db: Db, id: string): void {
  db.prepare(
    "UPDATE scan_runs SET status = 'canceled', finished_at = ? WHERE id = ? AND status = 'running'",
  ).run(new Date().toISOString(), id);
}

export function countKeys(db: Db): number {
  const row = db
    .prepare("SELECT COUNT(*) AS total FROM api_keys WHERE status != 'removed'")
    .get() as {
    total: number;
  };
  return Number(row.total);
}
