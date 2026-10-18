import type { FastifyReply, FastifyRequest } from "fastify";
import type { SessionRow } from "../../infra/db/repositories/rows.js";
import type { UserRow } from "../../infra/db/repositories/rows.js";

declare module "fastify" {
  interface FastifyRequest {
    session?: SessionRow;
    user?: UserRow;
    email?: string;
    sensitiveUntil?: Date;
  }
  interface FastifyContextConfig {
    requiresSession?: boolean;
    requiresSensitive?: boolean;
  }
}

export function clientIp(request: FastifyRequest): string | undefined {
  return request.ip;
}

export function clientUserAgent(request: FastifyRequest): string | undefined {
  const agent = request.headers["user-agent"];
  return typeof agent === "string" ? agent : undefined;
}

export function sessionCookie(request: FastifyRequest, reply: FastifyReply): string | undefined {
  void reply;
  return request.cookies["skp_session"];
}
