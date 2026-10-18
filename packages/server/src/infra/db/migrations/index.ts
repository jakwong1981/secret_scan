import type { Migration } from "./types.js";
import { initial } from "./0001_initial.js";

/** Migrations are applied in array order; rollback runs them in reverse. */
export const migrations: Migration[] = [initial];
