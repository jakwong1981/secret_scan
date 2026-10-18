import type { Db, SqlValue } from "../database.js";
import type { SettingsRow } from "./rows.js";
import { env } from "../../../config/env.js";
import { googleAllowedEmails } from "../../../config/env.js";

const SINGLETON_ID = 1;

export function readSettings(db: Db): SettingsRow {
  const row = db.prepare("SELECT * FROM settings WHERE id = ?").get(SINGLETON_ID) as unknown as SettingsRow | null;
  if (row) return row;
  db.prepare(
    `INSERT INTO settings (id, google_allowed_emails, session_idle_minutes, session_absolute_hours,
       verify_keys_opt_in, scan_root, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    SINGLETON_ID,
    JSON.stringify(googleAllowedEmails()),
    env.SKP_SESSION_IDLE_MINUTES,
    env.SKP_SESSION_ABSOLUTE_HOURS,
    env.SKP_VERIFY_KEYS_OPT_IN ? 1 : 0,
    env.SKP_SCAN_ROOT,
    new Date().toISOString(),
  );
  const created = db.prepare("SELECT * FROM settings WHERE id = ?").get(SINGLETON_ID) as unknown as SettingsRow;
  return created;
}

export function allowedGoogleEmails(db: Db): string[] {
  const stored = JSON.parse(readSettings(db).google_allowed_emails) as unknown;
  if (Array.isArray(stored) && stored.length > 0) {
    return (stored as unknown[]).filter((e): e is string => typeof e === "string");
  }
  return googleAllowedEmails();
}

export function updateSettings(
  db: Db,
  input: {
    googleAllowedEmails?: string[];
    sessionIdleMinutes?: number;
    sessionAbsoluteHours?: number;
    verifyKeysOptIn?: boolean;
  },
): SettingsRow {
  const current = readSettings(db);
  const next = {
    googleAllowedEmails: input.googleAllowedEmails ?? JSON.parse(current.google_allowed_emails),
    sessionIdleMinutes: input.sessionIdleMinutes ?? current.session_idle_minutes,
    sessionAbsoluteHours: input.sessionAbsoluteHours ?? current.session_absolute_hours,
    verifyKeysOptIn: input.verifyKeysOptIn ?? current.verify_keys_opt_in === 1,
  };
  db.prepare(
    `UPDATE settings
        SET google_allowed_emails = ?, session_idle_minutes = ?, session_absolute_hours = ?,
            verify_keys_opt_in = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    JSON.stringify(next.googleAllowedEmails),
    next.sessionIdleMinutes,
    next.sessionAbsoluteHours,
    next.verifyKeysOptIn ? 1 : 0,
    new Date().toISOString(),
    SINGLETON_ID,
  );
  return readSettings(db);
}

export function sessionLimits(db: Db): { idleMinutes: number; absoluteHours: number } {
  const settings = readSettings(db);
  return {
    idleMinutes: Number(settings.session_idle_minutes),
    absoluteHours: Number(settings.session_absolute_hours),
  };
}

export function isVerifyOptIn(db: Db): boolean {
  return readSettings(db).verify_keys_opt_in === 1;
}

export type { SqlValue };
