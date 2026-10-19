import type { Db } from "../database.js";
import { newId } from "../../ids.js";
import { hashValue } from "./session.repository.js";

const WINDOW_MINUTES = 5;
const MAX_FAILURES = 5;

export function recordLoginAttempt(
  db: Db,
  input: { email: string; ip?: string; ok: boolean },
): void {
  db.prepare(
    "INSERT INTO login_attempts (id, email, ip_hash, at, ok) VALUES (?, ?, ?, ?, ?)",
  ).run(
    newId(),
    input.email.toLowerCase(),
    input.ip ? hashValue(input.ip) : "unknown",
    new Date().toISOString(),
    input.ok ? 1 : 0,
  );
}

export function recentFailureCount(
  db: Db,
  email: string,
  _ip?: string,
): number {
  const cutoff = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const row = db
    .prepare(
      "SELECT COUNT(*) AS total FROM login_attempts WHERE ok = 0 AND at > ? AND email = ?",
    )
    .get(cutoff, email.toLowerCase()) as unknown as { total: number };
  return Number(row.total);
}

export function isLockedOut(db: Db, email: string, ip?: string): boolean {
  return recentFailureCount(db, email, ip) >= MAX_FAILURES;
}

export function clearFailedAttempts(db: Db, email: string): void {
  const cutoff = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  db.prepare(
    "DELETE FROM login_attempts WHERE ok = 0 AND at <= ? AND email = ?",
  ).run(cutoff, email.toLowerCase());
}
