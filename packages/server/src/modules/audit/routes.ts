import type { FastifyPluginAsync } from "fastify";
import { ok } from "../../core/http/respond.js";
import {
  countAudit,
  listAudit,
} from "../../infra/db/repositories/audit.repository.js";
import { toAuditEntry } from "./mapper.js";

const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/",
    { config: { requiresSession: true } },
    async (request, reply) => {
      const limit = Math.min(
        Number((request.query as Record<string, string>).limit ?? 50) || 50,
        200,
      );
      const offset = Math.max(
        Number((request.query as Record<string, string>).offset ?? 0) || 0,
        0,
      );
      const rows = listAudit(app.db, limit, offset);
      return ok(reply, {
        items: rows.map(toAuditEntry),
        total: countAudit(app.db),
      });
    },
  );
};

export default auditRoutes;
