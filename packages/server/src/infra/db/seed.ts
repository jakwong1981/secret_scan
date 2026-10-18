import type { Db } from "./database.js";
import { PROVIDER_REGISTRY } from "../scanner/provider-registry.js";
import { DEFAULT_SOURCES } from "../scanner/source-registry.js";
import { env } from "../../config/env.js";

/**
 * Seeds the provider catalogue and the default source registry.
 * `INSERT OR IGNORE` keeps owner customisations (disabled/enabled, added paths)
 * intact across restarts and upgrades.
 */
export function seedRegistry(db: Db): void {
  for (const provider of PROVIDER_REGISTRY) {
    db.prepare(
      `INSERT OR IGNORE INTO providers (id, label, key_prefixes, env_hints, docs_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      provider.id,
      provider.label,
      JSON.stringify(provider.keyPrefixes),
      JSON.stringify(provider.envHints ?? []),
      provider.docsUrl ?? null,
      new Date().toISOString(),
    );
  }

  for (const source of DEFAULT_SOURCES) {
    // Keychain access is impossible in containers / CI hosts; honour the switch.
    const enabled = source.kind === "keychain" ? env.SKP_KEYCHAIN_SCAN : source.enabled;
    db.prepare(
      `INSERT OR IGNORE INTO sources (id, kind, path, parser, provider_hint, enabled, priority, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      source.id,
      source.kind,
      source.path,
      source.parser,
      source.providerHint ?? null,
      enabled ? 1 : 0,
      source.priority,
      source.notes ?? null,
      new Date().toISOString(),
    );
  }
}
