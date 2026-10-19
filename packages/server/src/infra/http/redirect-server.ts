import { createServer, type Server } from "node:http";
import { env } from "../../config/env.js";
import { logger } from "../../core/logging/logger.js";

/**
 * Loopback-only 308 redirector so that a plain-http visit is upgraded to HTTPS
 * instead of failing. Never serves content.
 */
export function startHttpRedirector(port: number, httpsPort: number): Server {
  const server = createServer((request, response) => {
    const host =
      (request.headers.host ?? `127.0.0.1:${httpsPort}`).split(":")[0] ??
      "127.0.0.1";
    response.writeHead(308, {
      location: `https://${host}:${httpsPort}${request.url ?? "/"}`,
    });
    response.end();
  });
  server.listen(port, env.SKP_HOST, () => {
    logger.info(
      { port, host: env.SKP_HOST, httpsPort },
      "http -> https redirector listening",
    );
  });
  return server;
}
