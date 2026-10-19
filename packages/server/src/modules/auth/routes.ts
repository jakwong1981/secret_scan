import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import {
  bootstrapRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  verifyPasswordRequestSchema,
} from "@skp/contracts";
import { ok } from "../../core/http/respond.js";
import { SESSION_COOKIE } from "../../core/http/session-cookie.js";
import {
  env,
  googleAllowedEmails,
  googleConfigured,
} from "../../config/env.js";
import { readSettings } from "../../infra/db/repositories/settings.repository.js";
import {
  auditAuth,
  bootstrap,
  changePassword,
  completeGoogleAuth,
  listUserViews,
  login,
  logout,
  needsBootstrap,
  register,
  reauthenticate,
  resolveSession,
  startGoogleAuth,
  viewOf,
} from "./service.js";
import { clientIp, clientUserAgent } from "../../core/http/request-context.js";
import { ValidationError } from "../../core/errors/app-error.js";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(SESSION_COOKIE.name, sessionId, {
    httpOnly: SESSION_COOKIE.httpOnly,
    secure: SESSION_COOKIE.secure,
    sameSite: SESSION_COOKIE.sameSite,
    path: SESSION_COOKIE.path,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

function googleCallbackHtml(success: boolean, message?: string): string {
  const payload = JSON.stringify({
    type: "skp:google-auth",
    ok: success,
    message,
  });
  const script = success
    ? `window.opener && window.opener.postMessage(${payload}, window.location.origin); setTimeout(() => window.close(), 800);`
    : "setTimeout(() => window.close(), 4000);";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>SecretKeyPreview</title>
<style>body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fafaf9;color:#1c1917;display:grid;place-items:center;height:100vh;margin:0}
.card{background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:24px 28px;text-align:center;max-width:420px}
.ok{color:#166534}.err{color:#b91c1c}</style></head>
<body><div class="card">
<p class="${success ? "ok" : "err"}">${success ? "Signed in successfully - this window will close." : (message ?? "Sign-in failed")}</p>
</div>
<script>${script}</script>
</body></html>`;
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/status", async (request, reply) => {
    const settings = readSettings(app.db);
    const storedEmails = JSON.parse(settings.google_allowed_emails) as string[];
    return ok(reply, {
      needsBootstrap: needsBootstrap(app.db),
      passwordConfigured: !needsBootstrap(app.db),
      googleConfigured: googleConfigured(),
      googleAllowedEmails:
        storedEmails.length > 0 ? storedEmails : googleAllowedEmails(),
      passwordMinLength: env.SKP_PASSWORD_MIN_LENGTH,
    });
  });

  app.post(
    "/bootstrap",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const parsed = bootstrapRequestSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError("Invalid bootstrap payload");
      const context = bootstrap(app.db, {
        email: parsed.data.email,
        masterPassword: parsed.data.masterPassword,
        ip: clientIp(request),
        userAgent: clientUserAgent(request),
      });
      setSessionCookie(reply, context.session.id);
      auditAuth(app.db, {
        traceId: request.id,
        actor: context.user.email,
        action: "auth.bootstrap",
        outcome: "success",
      });
      return ok(reply, viewOf(context.user, app.db));
    },
  );

  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      const parsed = loginRequestSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError("Invalid login payload");
      try {
        const context = login(app.db, {
          email: parsed.data.email,
          masterPassword: parsed.data.masterPassword,
          ip: clientIp(request),
          userAgent: clientUserAgent(request),
        });
        setSessionCookie(reply, context.session.id);
        auditAuth(app.db, {
          traceId: request.id,
          actor: context.user.email,
          action: "auth.login",
          outcome: "success",
        });
        return ok(reply, viewOf(context.user, app.db));
      } catch (error) {
        auditAuth(app.db, {
          traceId: request.id,
          actor: parsed.data.email,
          action: "auth.login",
          outcome: "denied",
          detail: error instanceof Error ? error.name : "unknown",
        });
        throw error;
      }
    },
  );

  app.post(
    "/register",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "10 minutes" },
      },
    },
    async (request, reply) => {
      const parsed = registerRequestSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError("Invalid registration payload");
      const created = register(app.db, parsed.data);
      auditAuth(app.db, {
        traceId: request.id,
        actor: created.email,
        action: "auth.register",
        outcome: "success",
        target: created.email,
      });
      return ok(reply, created);
    },
  );

  app.get(
    "/users",
    { config: { requiresSession: true } },
    async (request, reply) => {
      const items = listUserViews(app.db);
      return ok(reply, { items, total: items.length });
    },
  );

  app.post(
    "/logout",
    { config: { requiresSession: true } },
    async (request, reply) => {
      const context = resolveSession(
        app.db,
        request.cookies[SESSION_COOKIE.name],
      );
      if (context) {
        logout(app.db, context.session.id);
        auditAuth(app.db, {
          traceId: request.id,
          actor: context.user.email,
          action: "auth.logout",
          outcome: "success",
        });
      }
      reply.clearCookie(SESSION_COOKIE.name, { path: "/" });
      return ok(reply, { revoked: true } as const);
    },
  );

  app.get(
    "/me",
    { config: { requiresSession: true } },
    async (request, reply) => {
      if (!request.user) throw new ValidationError("No active session");
      return ok(reply, viewOf(request.user, app.db));
    },
  );

  app.post(
    "/verify-password",
    {
      config: {
        requiresSession: true,
        rateLimit: { max: 10, timeWindow: "5 minutes" },
      },
    },
    async (request, reply) => {
      const parsed = verifyPasswordRequestSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError("Invalid re-authentication payload");
      if (!request.session) throw new ValidationError("No active session");
      const until = reauthenticate(app.db, {
        sessionId: request.session.id,
        masterPassword: parsed.data.masterPassword,
      });
      auditAuth(app.db, {
        traceId: request.id,
        actor: request.email ?? "owner",
        action: "auth.reauthenticate",
        outcome: "success",
        detail: `sensitive scope until ${until.toISOString()}`,
      });
      return ok(reply, { sensitiveScopeUntil: until.toISOString() });
    },
  );

  app.post(
    "/change-password",
    { config: { requiresSession: true, requiresSensitive: true } },
    async (request, reply) => {
      const parsed = z
        .object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(env.SKP_PASSWORD_MIN_LENGTH),
        })
        .safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError("Invalid password change payload");
      if (!request.session) throw new ValidationError("No active session");
      changePassword(app.db, {
        sessionId: request.session.id,
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      return ok(reply, { changed: true } as const);
    },
  );

  app.get("/google/start", async (request, reply) => {
    const challenge = startGoogleAuth(app.db);
    auditAuth(app.db, {
      traceId: request.id,
      actor: "anonymous",
      action: "auth.google.start",
      outcome: "success",
    });
    return ok(reply, challenge);
  });

  app.get("/google/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string };
    try {
      if (!query.code || !query.state)
        throw new ValidationError("Missing authorization code");
      const context = await completeGoogleAuth(app.db, {
        code: query.code,
        state: query.state,
        ip: clientIp(request),
        userAgent: clientUserAgent(request),
      });
      setSessionCookie(reply, context.session.id);
      auditAuth(app.db, {
        traceId: request.id,
        actor: context.user.email,
        action: "auth.google.callback",
        outcome: "success",
      });
      return reply.type("text/html").send(googleCallbackHtml(true));
    } catch (error) {
      auditAuth(app.db, {
        traceId: request.id,
        actor: "anonymous",
        action: "auth.google.callback",
        outcome: "denied",
        detail: error instanceof Error ? error.message : "unknown",
      });
      reply.status(400);
      return reply
        .type("text/html")
        .send(
          googleCallbackHtml(
            false,
            error instanceof Error ? error.message : "Sign-in failed",
          ),
        );
    }
  });
};

export default authRoutes;
