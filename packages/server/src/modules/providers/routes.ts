import type { FastifyPluginAsync } from "fastify";
import { ok } from "../../core/http/respond.js";
import { listProviders } from "../../infra/db/repositories/provider.repository.js";

const providersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { config: { requiresSession: true } }, async (request, reply) => {
    const rows = listProviders(app.db);
    return ok(
      reply,
      rows.map((row) => ({
        id: row.id,
        label: row.label,
        keyPrefixes: JSON.parse(row.key_prefixes) as string[],
        docsUrl: row.docs_url ?? undefined,
      })),
    );
  });
};

export default providersRoutes;
