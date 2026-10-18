import { createDatabase, rollbackMigrations, runMigrations } from "./database.js";

/** CLI: `tsx src/infra/db/migrate.ts [--down [n]]` */
const args = process.argv.slice(2);
const downIndex = args.indexOf("--down");

if (downIndex >= 0) {
  const steps = Number(args[downIndex + 1] ?? 1) || 1;
  const db = createDatabase();
  const rolledBack = rollbackMigrations(db, steps);
  db.close();
  process.stdout.write(`${rolledBack.length > 0 ? rolledBack.join(", ") : "nothing"} rolled back\n`);
} else {
  const db = createDatabase();
  runMigrations(db);
  db.close();
  process.stdout.write("migrations applied\n");
}
