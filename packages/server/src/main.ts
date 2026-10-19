import { readFileSync } from "node:fs";
import { buildApp, type TlsOptions } from "./app.js";
import { createDatabase, runMigrations } from "./infra/db/database.js";
import { seedRegistry } from "./infra/db/seed.js";
import { listSources } from "./infra/db/repositories/source.repository.js";
import { createScanService } from "./modules/scans/service.js";
import { toSourceDefinition } from "./modules/sources/mapper.js";
import { startHttpRedirector } from "./infra/http/redirect-server.js";
import { env } from "./config/env.js";
import { logger } from "./core/logging/logger.js";
import type { Db } from "./infra/db/database.js";
import type { SourceDefinition } from "./infra/scanner/types.js";

function loadSources(db: Db): SourceDefinition[] {
  return listSources(db).map(toSourceDefinition);
}

async function main(): Promise<void> {
  const db = createDatabase();
  runMigrations(db);
  seedRegistry(db);
  logger.info(
    { dataDir: env.SKP_DATA_DIR },
    "database ready (migrations + registry seeds applied)",
  );

  const scanService = createScanService(db, () => loadSources(db));
  const tls: TlsOptions = {
    key: readFileSync(env.SKP_TLS_KEY_PATH),
    cert: readFileSync(env.SKP_TLS_CERT_PATH),
    minVersion: env.SKP_TLS_MIN_VERSION,
    maxVersion: "TLSv1.3",
  };

  const app = await buildApp({ db, scanService, tls });
  await app.listen({ host: env.SKP_HOST, port: env.SKP_PORT });

  logger.info(
    { url: `https://${env.SKP_HOST}:${env.SKP_PORT}`, minTls: tls.minVersion },
    "SecretKeyPreview listening - HTTPS only",
  );

  const redirector = env.SKP_ENABLE_HTTP_REDIRECT
    ? startHttpRedirector(env.SKP_HTTP_REDIRECT_PORT, env.SKP_PORT)
    : null;

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, "shutting down");
    redirector?.close();
    await app.close();
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", (signal) => void shutdown(signal));
  process.on("SIGTERM", (signal) => void shutdown(signal));
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "failed to start server");
  process.exit(1);
});
