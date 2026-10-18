import { createHash } from "node:crypto";
import type { Db } from "../database.js";
import type { SessionRow } from "./rows.js";
import { newId } from "../../ids.js";

export function hashValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createSession(
  db: Db,
  input: {
    userId: string;
    idleMinutes: number;
    absoluteHours: number;
    ip?: string;
    userAgent?: string;
  },
): SessionRow {
  const now = new Date();
  const row = {
    id: newId(),
    user_id: input.userId,
    created_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    idle_expires_at: new Date(now.getTime() + input.idleMinutes * 60_000).toISOString(),
    absolute_expires_at: new Date(now.getTime() + input.absoluteHours * 3_600_000).toISOString(),
    sensitive_until: null as string | null,
    revoked_at: null as string | null,
    ip_hash: input.ip ? hashValue(input.ip) : null,
    user_agent_hash: input.userAgent ? hashValue(input.userAgent) : null,
  };
  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, last_seen_at, idle_expires_at,
       absolute_expires_at, sensitive_until, revoked_at, ip_hash, user_agent_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.user_id,
    row.created_at,
    row.last_seen_at,
    row.idle_expires_at,
    row.absolute_expires_at,
    row.sensitive_until,
    row.revoked_at,
    row.ip_hash,
    row.user_agent_hash,
  );
  const created = findSessionById(db, row.id);
  if (!created) throw new Error("failed to create session");
  return created;
}

export function findSessionById(db: Db, id: string): SessionRow | null {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
  return (row as unknown as SessionRow | null) ?? null;
}

export function touchSession(db: Db, session: SessionRow, idleMinutes: number): SessionRow {
  const now = new Date();
  const idleExpiresAt = new Date(now.getTime() + idleMinutes * 60_000).toISOString();
  db.prepare(
    "UPDATE sessions SET last_seen_at = ?, idle_expires_at = ? WHERE id = ?",
  ).run(now.toISOString(), idleExpiresAt, session.id);
  const updated = findSessionById(db, session.id);
  if (!updated) throw new Error("failed to touch session");
  return updated;
}

export function grantSensitiveScope(db: Db, sessionId: string, ttlMinutes: number): Date {
  const until = new Date(Date.now() + ttlMinutes * 60_000);
  db.prepare("UPDATE sessions SET sensitive_until = ? WHERE id = ?").run(until.toISOString(), sessionId);
  return until;
}

export function hasSensitiveScope(session: SessionRow, now = new Date()): boolean {
  return session.sensitive_until !== null && new Date(session.sensitive_until).getTime() > now.getTime();
}

export function isSessionUsable(session: SessionRow, now = new Date()): boolean {
  if (session.revoked_at) return false;
  if (new Date(session.idle_expires_at).getTime() <= now.getTime()) return false;
  if (new Date(session.absolute_expires_at).getTime() <= now.getTime()) return false;
  return true;
}

export function revokeSession(db: Db, sessionId: string): void {
  db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(
    new Date().toISOString(),
    sessionId,
  );
}

export function revokeAllSessionsForUser(db: Db, userId: string, exceptSessionId?: string): number {
  const result =
    exceptSessionId === undefined
      ? db.prepare("UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL").run(new Date().toISOString())
      : db
          .prepare("UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL AND id != ?")
          .run(new Date().toISOString(), exceptSessionId);
  return Number(result.changes);
}

export function rotateSession(db: Db, sessionId: string): string {
  const newSessionId = newId();
  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, last_seen_at, idle_expires_at,
       absolute_expires_at, sensitive_until, revoked_at, ip_hash, user_agent_hash)
     SELECT ?, user_id, created_at, last_seen_at, idle_expires_at, absolute_expires_at,
       sensitive_until, revoked_at, ip_hash, user_agent_hash FROM sessions WHERE id = ?`,
  ).run(newSessionId, sessionId);
  revokeSession(db, sessionId);
  return newSessionId;
}
