import type { Db, SqlValue } from "../database.js";
import type { GoogleIdentityRow, UserRow } from "./rows.js";
import { newId } from "../../ids.js";

export function findUserById(db: Db, id: string): UserRow | null {
  return (
    (db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(id) as unknown as UserRow | null) ?? null
  );
}

export function findUserByEmail(db: Db, email: string): UserRow | null {
  const row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase());
  return (row as unknown as UserRow | null) ?? null;
}

export function listUsers(db: Db): UserRow[] {
  return db
    .prepare("SELECT * FROM users ORDER BY created_at ASC")
    .all() as unknown as UserRow[];
}

export function countUsers(db: Db): number {
  const row = db
    .prepare("SELECT COUNT(*) AS total FROM users")
    .get() as unknown as { total: number };
  return Number(row.total);
}

export function createUser(
  db: Db,
  input: { email: string; passwordHash: string | null },
): UserRow {
  const id = newId();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
  ).run(
    id,
    input.email.toLowerCase(),
    input.passwordHash,
    new Date().toISOString(),
  );
  const created = findUserById(db, id);
  if (!created) throw new Error("failed to create user");
  return created;
}

export function updatePasswordHash(
  db: Db,
  userId: string,
  passwordHash: string,
): void {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    passwordHash,
    userId,
  );
}

export function touchLastLogin(db: Db, userId: string): void {
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    userId,
  );
}

export function listGoogleIdentities(
  db: Db,
  userId: string,
): GoogleIdentityRow[] {
  return db
    .prepare("SELECT * FROM google_identities WHERE user_id = ?")
    .all(userId) as unknown as GoogleIdentityRow[];
}

export function findGoogleIdentityBySub(
  db: Db,
  sub: string,
): GoogleIdentityRow | null {
  const row = db
    .prepare("SELECT * FROM google_identities WHERE google_sub = ?")
    .get(sub);
  return (row as unknown as GoogleIdentityRow | null) ?? null;
}

export function linkGoogleIdentity(
  db: Db,
  input: { userId: string; sub: string; email: string; pictureUrl?: string },
): void {
  const existing = findGoogleIdentityBySub(db, input.sub);
  if (existing) {
    db.prepare(
      "UPDATE google_identities SET user_id = ?, email = ?, picture_url = ?, linked_at = ? WHERE google_sub = ?",
    ).run(
      input.userId,
      input.email.toLowerCase(),
      input.pictureUrl ?? null,
      new Date().toISOString(),
      input.sub,
    );
    return;
  }
  db.prepare(
    "INSERT INTO google_identities (user_id, google_sub, email, picture_url, linked_at) VALUES (?, ?, ?, ?, ?)",
  ).run(
    input.userId,
    input.sub,
    input.email.toLowerCase(),
    input.pictureUrl ?? null,
    new Date().toISOString(),
  );
}

export function userMethods(
  db: Db,
  user: UserRow,
): Array<"password" | "google"> {
  const methods: Array<"password" | "google"> = [];
  if (user.password_hash) methods.push("password");
  if (listGoogleIdentities(db, user.id).length > 0) methods.push("google");
  return methods;
}

export type { SqlValue };
