import type { Db } from "../database.js";
import type { SourceRow } from "./rows.js";
import { newId } from "../../ids.js";

export function listSources(db: Db): SourceRow[] {
  return db.prepare("SELECT * FROM sources ORDER BY priority ASC, id ASC").all() as unknown as SourceRow[];
}

export function listEnabledSources(db: Db): SourceRow[] {
  return db
    .prepare("SELECT * FROM sources WHERE enabled = 1 ORDER BY priority ASC, id ASC")
    .all() as unknown as SourceRow[];
}

export function findSourceById(db: Db, id: string): SourceRow | null {
  const row = db.prepare("SELECT * FROM sources WHERE id = ?").get(id);
  return (row as unknown as SourceRow | null) ?? null;
}

export function upsertSource(
  db: Db,
  source: {
    id: string;
    kind: string;
    path: string;
    parser: string;
    providerHint?: string;
    priority: number;
    notes?: string;
  },
): void {
  db.prepare(
    `INSERT INTO sources (id, kind, path, parser, provider_hint, enabled, priority, notes, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       path = excluded.path,
       parser = excluded.parser,
       provider_hint = excluded.provider_hint,
       priority = excluded.priority,
       notes = excluded.notes`,
  ).run(
    source.id,
    source.kind,
    source.path,
    source.parser,
    source.providerHint ?? null,
    source.priority,
    source.notes ?? null,
    new Date().toISOString(),
  );
}

export function insertSource(
  db: Db,
  input: {
    kind: string;
    path: string;
    parser: string;
    providerHint?: string;
    notes?: string;
  },
): SourceRow {
  const id = newId();
  const priorityRow = db.prepare("SELECT COALESCE(MAX(priority), 0) + 10 AS next FROM sources").get() as {
    next: number;
  };
  db.prepare(
    `INSERT INTO sources (id, kind, path, parser, provider_hint, enabled, priority, notes, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  ).run(
    id,
    input.kind,
    input.path,
    input.parser,
    input.providerHint ?? null,
    Number(priorityRow.next),
    input.notes ?? null,
    new Date().toISOString(),
  );
  const created = findSourceById(db, id);
  if (!created) throw new Error("failed to create source");
  return created;
}

export function updateSource(
  db: Db,
  id: string,
  input: { enabled?: boolean; path?: string; notes?: string },
): void {
  const assignments: string[] = [];
  const params: Array<string | number> = [];
  if (input.enabled !== undefined) {
    assignments.push("enabled = ?");
    params.push(input.enabled ? 1 : 0);
  }
  if (input.path !== undefined) {
    assignments.push("path = ?");
    params.push(input.path);
  }
  if (input.notes !== undefined) {
    assignments.push("notes = ?");
    params.push(input.notes);
  }
  if (assignments.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE sources SET ${assignments.join(", ")} WHERE id = ?`).run(...params);
}

export function deleteSource(db: Db, id: string): void {
  db.prepare("DELETE FROM sources WHERE id = ?").run(id);
}
