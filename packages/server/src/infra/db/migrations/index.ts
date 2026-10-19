import type { Migration } from "./types.js";
import { initial } from "./0001_initial.js";
import { providerEvidence } from "./0002_provider_evidence.js";
import { keySources } from "./0003_key_sources.js";

/** Migrations are applied in array order; rollback runs them in reverse. */
export const migrations: Migration[] = [initial, providerEvidence, keySources];
