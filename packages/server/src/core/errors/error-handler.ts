import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { ZodError } from "zod";
import { AppError, isAppError } from "./app-error.js";
import { logger } from "../logging/logger.js";

export interface ApiErrorBody {
  code: string;
  message: string;
  data?: unknown;
  timestamp: string;
  traceId: string;
}

function body(error: unknown, request: FastifyRequest): ApiErrorBody {
  const traceId = request.id;
  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.message,
      data: error.data,
      timestamp: new Date().toISOString(),
      traceId,
    };
  }
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: "Request payload failed validation",
      data: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      timestamp: new Date().toISOString(),
      traceId,
    };
  }
  const fastifyError = error as FastifyError;
  if (fastifyError?.statusCode && fastifyError.code) {
    return {
      code: fastifyError.code,
      message: fastifyError.message,
      timestamp: new Date().toISOString(),
      traceId,
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "Internal error",
    timestamp: new Date().toISOString(),
    traceId,
  };
}

function statusOf(error: unknown): number {
  if (isAppError(error)) return error.statusCode;
  const fastifyError = error as FastifyError;
  if (fastifyError?.statusCode) return fastifyError.statusCode;
  return 500;
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler(
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.url.startsWith("/api/")) {
        // SPA fallback: any non-API route renders the single-page app
        try {
          await reply.sendFile("index.html");
          return reply;
        } catch {
          // no static build present - fall through to the JSON 404
        }
      }
      const payload = body(
        new AppError(404, "NOT_FOUND", "Route not found"),
        request,
      );
      return reply.status(404).send(payload);
    },
  );

  app.setErrorHandler(
    (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
      const payload = body(error, request);
      if (payload.code === "INTERNAL_ERROR") {
        logger.error(
          { err: error, traceId: payload.traceId, url: request.url },
          "unhandled error",
        );
      } else if (payload.code === "VALIDATION_ERROR") {
        logger.debug(
          { traceId: payload.traceId, url: request.url },
          "request rejected",
        );
      } else {
        logger.warn(
          {
            err: error,
            traceId: payload.traceId,
            url: request.url,
            code: payload.code,
          },
          "request failed",
        );
      }
      return reply.status(statusOf(error)).send(payload);
    },
  );
}
