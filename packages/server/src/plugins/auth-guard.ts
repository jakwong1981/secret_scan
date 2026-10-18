import type { FastifyInstance } from "fastify";
import { SESSION_COOKIE } from "../core/http/session-cookie.js";
import { assertSensitiveScope, resolveSession, touchForRequest } from "../modules/auth/service.js";
import { UnauthenticatedError } from "../core/errors/app-error.js";

/**
 * Guard driven by route config:
 *   config: { requiresSession: true }                           → signed-in owner
 *   config: { requiresSession: true, requiresSensitive: true }  → + re-authentication scope
 */
export function registerAuthGuard(app: FastifyInstance): void {
  app.addHook("preHandler", (request, _reply, done) => {
    const config = request.routeOptions.config;
    if (!config?.requiresSession) {
      done();
      return;
    }
    try {
      const sessionId = request.cookies[SESSION_COOKIE.name];
      const context = resolveSession(app.db, sessionId);
      if (!context) throw new UnauthenticatedError();

      const touched = touchForRequest(app.db, context);
      request.session = touched.session;
      request.user = touched.user;
      request.email = touched.user.email;

      if (config.requiresSensitive) {
        assertSensitiveScope(touched.session);
      }
      done();
    } catch (error) {
      done(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
