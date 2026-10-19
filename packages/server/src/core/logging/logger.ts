import pino, { type Logger } from "pino";
import { env } from "../../config/env.js";

/** Never log key material or credentials. */
export const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  "password",
  "masterPassword",
  "currentPassword",
  "newPassword",
  "*.*.password",
  "*.*.masterPassword",
  "*.*.apiKey",
  "*.*.token",
  "*.*.secret",
  "value",
  "*.value",
  "*.cipherText",
  "*.iv",
  "*.authTag",
  'res.headers["set-cookie"]',
];

const CENSOR = "[REDACTED]";

function prettyTransport(): {
  transport: { target: string; options: Record<string, unknown> };
} {
  return {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss" },
    },
  };
}

function baseConfig(): Record<string, unknown> {
  return {
    level: env.SKP_LOG_LEVEL,
    base: { service: "secretkeypreview-server" },
    redact: { paths: REDACT_PATHS, censor: CENSOR },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

/** Logger configuration object accepted by Fastify. */
export function fastifyLoggerConfig(): Record<string, unknown> {
  const config = baseConfig();
  if (
    env.SKP_NODE_ENV === "development" ||
    process.env.SKP_LOG_PRETTY === "true"
  ) {
    return { ...config, ...prettyTransport() };
  }
  return config;
}

/** Application logger used by services and repositories. */
export function createLogger(): Logger {
  return pino({
    ...baseConfig(),
    ...(env.SKP_NODE_ENV === "development" ||
    process.env.SKP_LOG_PRETTY === "true"
      ? prettyTransport()
      : {}),
  });
}

export type { Logger };
export const logger = createLogger();
