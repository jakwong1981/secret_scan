import type { Db } from "../db/database.js";
import type { ScanService } from "../../modules/scans/service.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    scanService: ScanService;
  }
}
