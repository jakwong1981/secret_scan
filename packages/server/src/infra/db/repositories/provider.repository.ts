import type { Db } from "../database.js";
import type { ProviderRow } from "./rows.js";
import type { ProviderDefinition } from "../../scanner/provider-registry.js";

export function listProviders(db: Db): ProviderRow[] {
  return db.prepare("SELECT * FROM providers ORDER BY label ASC").all() as unknown as ProviderRow[];
}

/** Idempotent registry seed — the provider catalogue stays in code (single source of truth). */
export function seedProviders(db: Db, definitions: ProviderDefinition[]): void {
  for (const definition of definitions) {
    db.prepare(
      `INSERT INTO providers (id, label, key_prefixes, env_hints, docs_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET label = excluded.label, key_prefixes = excluded.key_prefixes,
         env_hints = excluded.env_hints, docs_url = excluded.docs_url`,
    ).run(
      definition.id,
      definition.label,
      JSON.stringify(definition.keyPrefixes),
      JSON.stringify(definition.envHints ?? []),
      definition.docsUrl ?? null,
      new Date().toISOString(),
    );
  }
}

export function providerLabel(db: Db, id: string): string {
  const row = db.prepare("SELECT label FROM providers WHERE id = ?").get(id) as unknown as { label: string } | null;
  return row?.label ?? id;
}
