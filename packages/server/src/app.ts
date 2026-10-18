import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fastifyLoggerConfig } from "./core/logging/logger.js";
import { registerErrorHandlers } from "./core/errors/error-handler.js";
import { registerAuthGuard } from "./plugins/auth-guard.js";
import healthRoutes from "./modules/health/routes.js";
import authRoutes from "./modules/auth/routes.js";
import keysRoutes from "./modules/keys/routes.js";
import scansRoutes from "./modules/scans/routes.js";
import sourcesRoutes from "./modules/sources/routes.js";
import settingsRoutes from "./modules/settings/routes.js";
import auditRoutes from "./modules/audit/routes.js";
import providersRoutes from "./modules/providers/routes.js";
import type { Db } from "./infra/db/database.js";
import type { ScanService } from "./modules/scans/service.js";

export interface TlsOptions {
  key: Buffer;
  cert: Buffer;
  minVersion?: "TLSv1.2" | "TLSv1.3";
  maxVersion?: "TLSv1.3";
}

export interface BuildAppOptions {
  db: Db;
  scanService: ScanService;
  tls?: TlsOptions;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: fastifyLoggerConfig(),
    genReqId: () => randomUUID(),
    bodyLimit: 1024 * 1024,
    trustProxy: false,
    ...(options.tls ? { https: options.tls } : {}),
  });

  app.decorate("db", options.db);
  app.decorate("scanService", options.scanService);

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  registerAuthGuard(app);
  registerErrorHandlers(app);

  app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes, { prefix: "/auth" });
      await api.register(keysRoutes, { prefix: "/keys" });
      await api.register(scansRoutes, { prefix: "/scans" });
      await api.register(sourcesRoutes, { prefix: "/sources" });
      await api.register(settingsRoutes, { prefix: "/settings" });
      await api.register(auditRoutes, { prefix: "/audit" });
      await api.register(providersRoutes, { prefix: "/providers" });
    },
    { prefix: "/api/v1" },
  );

  const webDist = resolve(import.meta.dirname, "../../web/dist");
  if (existsSync(webDist)) {
    await app.register(staticPlugin, { root: webDist, prefix: "/", decorateReply: false });
  }

  return app;
}
