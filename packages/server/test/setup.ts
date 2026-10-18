import { mkdtempSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "skp-server-test-"));
const keyFile = join(dir, "vault.key");
writeFileSync(keyFile, randomBytes(32).toString("base64"));

process.env.SKP_DATA_DIR = dir;
process.env.SKP_DB_FILE = "test.db";
process.env.SKP_VAULT_MASTER_KEY_FILE = keyFile;
process.env.SKP_LOG_LEVEL = "error";
process.env.SKP_NODE_ENV = "test";
process.env.SKP_PASSWORD_MIN_LENGTH = "8";
process.env.SKP_SESSION_IDLE_MINUTES = "30";
process.env.SKP_SESSION_ABSOLUTE_HOURS = "12";
process.env.SKP_SCAN_ROOT = dir;
delete process.env.SKP_VAULT_MASTER_PASSWORD;
