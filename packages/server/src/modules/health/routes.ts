import type { FastifyPluginAsync } from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.js";

let version = "0.1.0";
try {
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"),
  ) as { version?: string };
  version = pkg.version ?? version;
} catch {
  // package.json is not shipped in the production image; keep the default
}

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async (request, reply) => {
    const dbOk = (() => {
      try {
        app.db.prepare("SELECT 1").get();
        return true;
      } catch {
        return false;
      }
    })();
    reply.header("strict-transport-security", `max-age=31536000; includeSubDomains`);
    return reply.status(dbOk ? 200 : 503).send(
      {
        code: dbOk ? "OK" : "SERVICE_UNAVAILABLE",
        message: dbOk ? undefined : "database unavailable",
        data: dbOk
          ? {
              status: "ok" as const,
              version,
              uptimeSeconds: Math.round(process.uptime()),
              tls: true as const,
              environment: env.SKP_NODE_ENV ?? "production",
            }
          : undefined,
        timestamp: new Date().toISOString(),
        traceId: request.id,
      },
    );
  });
};

export default healthRoutes;
