import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { execFileSync } from "node:child_process";

export async function testPostgres(beforePeopleMigration?: (owner: pg.Client, ownerUrl: string) => Promise<void>) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const password = randomBytes(24).toString("hex");
  const directory = await mkdtemp(join(tmpdir(), "griipbuddy-foundation-test-"));
  const postgres = new EmbeddedPostgres({ databaseDir: join(directory, "data"), user: "employee_owner", password, port, persistent: false,
    postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
    onLog: () => {}, onError: () => {} });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("employee_foundation_test");
  const ownerUrl = `postgresql://employee_owner:${password}@127.0.0.1:${port}/employee_foundation_test`;
  const runtimeUrl = `postgresql://employee_runtime:${password}@127.0.0.1:${port}/employee_foundation_test`;
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  try {
    await owner.query(`CREATE ROLE employee_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    if (beforePeopleMigration) {
      await owner.query(await readFile("prisma/migrations/202610090001_foundation/migration.sql", "utf8"));
      execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "resolve", "--applied", "202610090001_foundation"], { env: { ...process.env, MIGRATION_DATABASE_URL: ownerUrl }, stdio: "pipe" });
      await beforePeopleMigration(owner, ownerUrl);
    }
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, MIGRATION_DATABASE_URL: ownerUrl }, stdio: "pipe" });
    execFileSync(process.execPath, ["--import", "tsx", "scripts/runtime-grants.ts"], { env: { ...process.env, MIGRATION_DATABASE_URL: ownerUrl }, stdio: "pipe" });
  } catch (error) { await owner.end(); await postgres.stop(); throw error; }
  return { owner, ownerUrl, runtimeUrl, port, async stop() { await owner.end(); await postgres.stop(); } };
}
