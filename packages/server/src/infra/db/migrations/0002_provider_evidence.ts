import type { Migration } from "./types.js";

/**
 * Persists the signal that named each key's provider, so a later, weaker hint
 * cannot demote a stronger one: without it, a `source-hint` from a
 * vendor-specific file overrides an `ANTHROPIC_*` / `DASHSCOPE_*` key name.
 * Rows written before this column existed are backfilled to `env-hint`, the
 * rank the scanner previously assumed for any already-stored provider.
 */
const UP = [
  `ALTER TABLE api_keys ADD COLUMN provider_evidence TEXT NOT NULL DEFAULT 'env-hint'`,
];

const DOWN = [`ALTER TABLE api_keys DROP COLUMN provider_evidence`];

export const providerEvidence: Migration = {
  id: "0002_provider_evidence",
  up: UP,
  down: DOWN,
};
