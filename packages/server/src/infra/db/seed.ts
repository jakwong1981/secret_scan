import type { Db } from "./database.js";
import { PROVIDER_REGISTRY } from "../scanner/provider-registry.js";
import { DEFAULT_SOURCES } from "../scanner/source-registry.js";
import { env } from "../../config/env.js";

/**
 * Seeds the provider catalogue and the default source registry.
 * Labels, hints and priority follow the code registry; the owner's enabled
 * toggle and any edited path survive, so a re-seed never re-arms a source the
 * owner switched off.
 */
export function seedRegistry(db: Db): void {
  for (const provider of PROVIDER_REGISTRY) {
    db.prepare(
      `INSERT INTO providers (id, label, key_prefixes, env_hints, docs_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET label = excluded.label,
         key_prefixes = excluded.key_prefixes, env_hints = excluded.env_hints,
         docs_url = excluded.docs_url`,
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
    const enabled =
      source.kind === "keychain" ? env.SKP_KEYCHAIN_SCAN : source.enabled;
    db.prepare(
      `INSERT INTO sources (id, kind, path, parser, provider_hint, enabled, priority, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET provider_hint = excluded.provider_hint,
         priority = excluded.priority, notes = excluded.notes`,
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
