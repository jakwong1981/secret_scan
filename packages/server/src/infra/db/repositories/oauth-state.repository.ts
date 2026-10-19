import { randomBytes } from "node:crypto";
import type { Db } from "../database.js";
import type { OauthStateRow } from "./rows.js";
import { newId } from "../../ids.js";

const STATE_TTL_MINUTES = 10;

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export interface OauthChallenge {
  state: string;
  nonce: string;
  codeVerifier: string;
  expiresAt: Date;
}

export function createOauthChallenge(db: Db): OauthChallenge {
  const state = base64Url(randomBytes(24));
  const nonce = base64Url(randomBytes(24));
  const codeVerifier = base64Url(randomBytes(48));
  const now = new Date();
  db.prepare(
    "INSERT INTO oauth_states (state, code_verifier, nonce, created_at) VALUES (?, ?, ?, ?)",
  ).run(state, codeVerifier, nonce, now.toISOString());
  return {
    state,
    nonce,
    codeVerifier,
    expiresAt: new Date(now.getTime() + STATE_TTL_MINUTES * 60_000),
  };
}

/** Consumes (single-use) a state, returning null when unknown, consumed or expired. */
export function consumeOauthChallenge(
  db: Db,
  state: string,
): OauthStateRow | null {
  const row = db
    .prepare("SELECT * FROM oauth_states WHERE state = ?")
    .get(state) as unknown as OauthStateRow | null;
  if (!row || row.consumed_at) return null;
  if (
    new Date(row.created_at).getTime() + STATE_TTL_MINUTES * 60_000 <
    Date.now()
  )
    return null;
  db.prepare("UPDATE oauth_states SET consumed_at = ? WHERE state = ?").run(
    new Date().toISOString(),
    state,
  );
  return row;
}

export function purgeExpiredOauthChallenges(db: Db): number {
  const cutoff = new Date(
    Date.now() - STATE_TTL_MINUTES * 60_000,
  ).toISOString();
  const result = db
    .prepare("DELETE FROM oauth_states WHERE created_at < ?")
    .run(cutoff);
  return Number(result.changes);
}

export function findUnusedChallenge(
  db: Db,
  state: string,
): OauthStateRow | null {
  const row = db
    .prepare(
      "SELECT * FROM oauth_states WHERE state = ? AND consumed_at IS NULL",
    )
    .get(state);
  return (row as unknown as OauthStateRow | null) ?? null;
}

export function challengeExpiry(db: Db, state: string): Date | null {
  const row = findUnusedChallenge(db, state);
  return row
    ? new Date(new Date(row.created_at).getTime() + STATE_TTL_MINUTES * 60_000)
    : null;
}

export function newOauthStateId(): string {
  return newId();
}
