import type { Migration } from "./types.js";

/**
 * Every home of a secret. `api_keys` keeps one row per value (dedupe by
 * fingerprint) and a single `source_path`, which silently hid that e.g. one
 * relay token is shared by `~/.codex/auth.json`, `~/.claude/settings.json` and
 * `~/.kimi-code/config.toml`. `key_sources` records each sighting, newest
 * `last_seen_at` per (key, place), so the UI can show them all.
 */
const UP = [
  `CREATE TABLE key_sources (
     key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
     source_kind TEXT NOT NULL,
     source_path TEXT NOT NULL,
     source_pointer TEXT NOT NULL DEFAULT '',
     env_var_name TEXT,
     first_seen_at TEXT NOT NULL,
     last_seen_at TEXT NOT NULL,
     PRIMARY KEY (key_id, source_path, source_pointer)
   )`,

  // Every existing key already knows its current home; seed it as the only
  // sighting so history continues from there.
  `INSERT INTO key_sources (key_id, source_kind, source_path, source_pointer,
       env_var_name, first_seen_at, last_seen_at)
   SELECT id, source_kind, source_path, COALESCE(source_pointer, ''),
          env_var_name, first_seen_at, last_seen_at
     FROM api_keys`,

  `CREATE INDEX idx_key_sources_key ON key_sources(key_id, first_seen_at ASC)`,
];

const DOWN = ["DROP TABLE IF EXISTS key_sources"];

export const keySources: Migration = {
  id: "0003_key_sources",
  up: UP,
  down: DOWN,
};
