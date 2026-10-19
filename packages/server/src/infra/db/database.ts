import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "../../config/env.js";
import { logger } from "../../core/logging/logger.js";
import { migrations } from "./migrations/index.js";
import type { Migration } from "./migrations/types.js";

export type Db = DatabaseSync;
export type SqlValue = string | number | null;

export function databasePath(): string {
  return resolve(env.SKP_DATA_DIR, env.SKP_DB_FILE);
}

export function createDatabase(file = databasePath()): DatabaseSync {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

export function runMigrations(db: Db): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    queryAll<{ id: string }>(db, "SELECT id FROM _migrations").map(
      (row) => row.id,
    ),
  );
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    db.exec("BEGIN");
    try {
      for (const statement of migration.up) db.exec(statement);
      db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(
        migration.id,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
      logger.info({ migration: migration.id }, "migration applied");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

/** Rolls back the last `steps` applied migrations (operational safety net). */
export function rollbackMigrations(db: Db, steps = 1): string[] {
  const applied = queryAll<{ id: string; applied_at: string }>(
    db,
    "SELECT id, applied_at FROM _migrations ORDER BY applied_at DESC, id DESC",
  ).map((row) => row.id);

  const rolledBack: string[] = [];
  for (const id of applied.slice(0, steps)) {
    const migration = migrations.find((m) => m.id === id);
    if (!migration) continue;
    db.exec("BEGIN");
    try {
      for (const statement of migration.down) db.exec(statement);
      db.prepare("DELETE FROM _migrations WHERE id = ?").run(id);
      db.exec("COMMIT");
      rolledBack.push(id);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return rolledBack;
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function queryAll<T>(db: Db, sql: string, ...params: SqlValue[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function queryOne<T>(
  db: Db,
  sql: string,
  ...params: SqlValue[]
): T | null {
  const row = db.prepare(sql).get(...params);
  return (row as T | null | undefined) ?? null;
}

export function execute(
  db: Db,
  sql: string,
  ...params: SqlValue[]
): { changes: number } {
  const result = db.prepare(sql).run(...params);
  return { changes: Number(result.changes) };
}

export type { Migration };
