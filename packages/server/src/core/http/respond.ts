import type { FastifyReply, FastifyRequest } from "fastify";

export interface Envelope<T> {
  code: "OK";
  message?: string;
  data: T;
  timestamp: string;
  traceId: string;
}

export function envelope<T>(
  request: FastifyRequest,
  data: T,
  message?: string,
): Envelope<T> {
  return {
    code: "OK",
    message,
    data,
    timestamp: new Date().toISOString(),
    traceId: request.id,
  };
}

export function ok<T>(
  reply: FastifyReply,
  data: T,
  message?: string,
): FastifyReply {
  return reply.send(envelope(reply.request, data, message));
}
