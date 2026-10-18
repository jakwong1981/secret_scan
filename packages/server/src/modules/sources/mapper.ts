import type { SourceDefinition } from "../../infra/scanner/types.js";
import type { SourceRow } from "../../infra/db/repositories/rows.js";

export function toSourceDefinition(row: SourceRow): SourceDefinition {
  return {
    id: row.id,
    kind: row.kind as SourceDefinition["kind"],
    path: row.path,
    parser: row.parser as SourceDefinition["parser"],
    providerHint: row.provider_hint ?? undefined,
    enabled: row.enabled === 1,
    priority: Number(row.priority),
    notes: row.notes ?? undefined,
  };
}
