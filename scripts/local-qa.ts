// Persistent, disposable LOCAL QA workspace. Never reads DATABASE_URL or any production configuration.
// Usage: node --conditions=react-server --import tsx scripts/local-qa.ts [--mode=dev|prod] [--port=3030] [--reset] [--name=e2e --db-port=54349]
// --name keeps a separate instance in .local/qa-<name> (e.g. for automated E2E runs) without touching .local/qa.
// Data, secrets, generated synthetic credentials and documents stay in the ignored .local/qa directory.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync, cpSync } from "node:fs";
import { createServer } from "node:net";
import { resolve, relative } from "node:path";
import type { Identity } from "../src/types/auth";

process.umask(0o077);
const args = new Map(process.argv.slice(2).map(arg => { const [key, value = "true"] = arg.replace(/^--/, "").split("="); return [key, value]; }));
const mode = args.get("mode") === "prod" ? "prod" : "dev";
const name = args.get("name"), directory = resolve(name && /^[a-z0-9-]+$/.test(name) ? `.local/qa-${name}` : ".local/qa"), dataDirectory = resolve(directory, "data"), documents = resolve(directory, "documents");
const log = resolve(directory, "startup.log"), configFile = resolve(directory, "config.json"), accountsFile = resolve(directory, "accounts.json");
if (relative(resolve("."), directory).startsWith("..")) throw new Error("QA directory must stay inside this checkout.");
// Never inherit connection strings: every URL below is constructed for the embedded loopback server.
for (const key of Object.keys(process.env)) if (/DATABASE_URL|^POSTGRES_|^BOOTSTRAP_ADMIN_/.test(key)) delete process.env[key];
if (args.has("reset")) {
  // Disposable data only: the embedded cluster in .local/qa/data is the sole target.
  rmSync(dataDirectory, { recursive: true, force: true }); rmSync(documents, { recursive: true, force: true }); rmSync(accountsFile, { force: true });
  console.log("Removed the disposable local QA database and documents.");
}
mkdirSync(documents, { recursive: true, mode: 0o700 });
if (!existsSync(configFile)) writeFileSync(configFile, JSON.stringify({ ownerPassword: randomBytes(32).toString("hex"), runtimePassword: randomBytes(32).toString("hex"), authSecret: randomBytes(32).toString("hex"), databasePort: Number(args.get("db-port") ?? 54339) }), { mode: 0o600 });
const config = JSON.parse(readFileSync(configFile, "utf8")) as { ownerPassword: string; runtimePassword: string; authSecret: string; databasePort: number };
const port = Number(args.get("port") ?? 3030), base = `http://127.0.0.1:${port}`;
const ownerUrl = `postgresql://employee_owner:${config.ownerPassword}@127.0.0.1:${config.databasePort}/employee_qa`;
const runtimeUrl = `postgresql://employee_runtime:${config.runtimePassword}@127.0.0.1:${config.databasePort}/employee_qa`;
const server = new EmbeddedPostgres({ databaseDir: dataDirectory, user: "employee_owner", password: config.ownerPassword, port: config.databasePort, persistent: true, authMethod: "scram-sha-256",
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"], onLog: message => appendFileSync(log, `${message}\n`), onError: message => appendFileSync(log, `${message}\n`) });
let app: ChildProcess | undefined, started = false, stopping = false;
async function stop(code = 0) {
  if (stopping) return; stopping = true;
  if (app && app.exitCode === null) { app.kill("SIGTERM"); await new Promise(done => app!.once("exit", done)); }
  if (started) await server.stop();
  process.exit(code);
}
process.on("SIGINT", () => void stop()); process.on("SIGTERM", () => void stop());
async function requireFreePort(value: number) {
  const probe = createServer();
  await new Promise<void>((done, fail) => { probe.once("error", () => fail(new Error(`Local port ${value} is in use; existing processes were left running.`))); probe.listen(value, "127.0.0.1", done); });
  await new Promise(done => probe.close(done));
}
function tool(toolArgs: string[]) {
  try { appendFileSync(log, execFileSync(process.execPath, toolArgs, { env: { ...process.env, MIGRATION_DATABASE_URL: ownerUrl }, encoding: "utf8", stdio: "pipe" })); }
  catch (error) { const e = error as { stdout?: string; stderr?: string }; appendFileSync(log, `${e.stdout ?? ""}\n${e.stderr ?? ""}\n`); throw new Error(`Local database setup failed; see ${relative(resolve("."), log)}.`, { cause: error }); }
}
async function seed() {
  process.env.DATABASE_URL = runtimeUrl;
  const { db } = await import("../src/lib/db/client");
  if (await db.user.count()) return false;
  const { localDate, addDays, weekStart, dayStart } = await import("../src/features/time/dates");
  const catalogs = await import("../src/features/organization/catalogs"), rates = await import("../src/features/pay/rates"), schedules = await import("../src/features/time/schedules");
  const corrections = await import("../src/features/review/corrections"), overtime = await import("../src/features/review/overtime"), tasks = await import("../src/features/tasks/service");
  const controls = await import("../src/features/accounts/controls"), absence = await import("../src/features/review/absence"), commissions = await import("../src/features/pay/commissions");
  const records = await import("../src/features/people-operations/records"), assets = await import("../src/features/people-operations/assets");
  const password = `QA-${randomBytes(9).toString("base64url")}-local`, passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const identity = (userId: string): Identity => { const issuedAt = Date.now(); return { userId, sessionVersion: 1, issuedAt, absoluteExpiresAt: issuedAt + 43200000 }; };
  const admin = await db.user.create({ data: { email: "admin@qa.example.test", displayName: "Morgan Admin", role: "ADMIN", passwordHash, mustChangePassword: false } });
  const hr = await db.user.create({ data: { email: "hr@qa.example.test", displayName: "Samira HR", role: "HR_MANAGER", passwordHash, mustChangePassword: false } });
  const zone = "Asia/Dhaka", today = localDate(new Date(), zone), thisWeek = weekStart(today), lastWeek = addDays(thisWeek, -7);
  await db.organizationSettings.create({ data: { companyName: "GriipBuddy QA (synthetic)", timezone: zone, currency: "BDT", changedBy: admin.id, earningsEffectiveFrom: new Date(`${addDays(lastWeek, -28).slice(0, 7)}-01`), overtimePolicyVersions: [{ effectiveFrom: "2020-01-06", thresholdSeconds: 172800, ruleVersion: 1 }] } });
  const department: Record<string, string> = {}, position: Record<string, string> = {};
  for (const name of ["Operations", "Customer Support", "Warehouse"]) department[name] = (await catalogs.createCatalog(identity(admin.id), "departments", { name }))!;
  for (const name of ["Operations associate", "Support specialist", "Warehouse lead"]) position[name] = (await catalogs.createCatalog(identity(admin.id), "positions", { name }))!;
  const people = [
    { key: "commission", email: "commission@qa.example.test", name: "Alex Rahman", number: "QA-001", dept: "Operations", pos: "Operations associate" },
    { key: "employee", email: "employee@qa.example.test", name: "Jordan Hasan", number: "QA-002", dept: "Customer Support", pos: "Support specialist" },
    { key: "colleague", email: "colleague@qa.example.test", name: "Priya Sultana", number: "QA-003", dept: "Warehouse", pos: "Warehouse lead" },
    { key: "onhold", email: "onhold@qa.example.test", name: "Nadia Karim", number: "QA-004", dept: "Operations", pos: "Operations associate" },
    { key: "suspended", email: "suspended@qa.example.test", name: "Imran Chowdhury", number: "QA-005", dept: "Warehouse", pos: "Warehouse lead" },
    { key: "schedule", email: "schedule@qa.example.test", name: "Taylor Schedule", number: "QA-006", dept: "Operations", pos: "Operations associate" },
  ];
  const employees: Record<string, { userId: string; employeeId: string; periodId: string }> = {};
  for (const person of people) {
    const user = await db.user.create({ data: { email: person.email, role: "EMPLOYEE", passwordHash, mustChangePassword: false } });
    const employee = await db.employee.create({ data: { userId: user.id, employeeNumber: person.number, legalName: person.name, phone: "+880 1700 000000", createdBy: admin.id,
      employmentPeriods: { create: { startDate: new Date("2025-01-01"), departmentId: department[person.dept], positionId: position[person.pos], departmentLabel: person.dept, positionLabel: person.pos, createdBy: admin.id } } }, include: { employmentPeriods: true } });
    employees[person.key] = { userId: user.id, employeeId: employee.id, periodId: employee.employmentPeriods[0].id };
    await rates.publishRate(identity(hr.id), { employeeId: employee.id, employmentPeriodId: employee.employmentPeriods[0].id, effectiveFrom: "2025-01-01", effectiveUntil: "", payType: "MONTHLY", baseAmount: "30000", overtimeHourlyRate: "150", overtimeHourlyEquivalent: "", overtimeMultiplier: "1", reason: "Synthetic QA compensation terms" });
  }
  // Default pattern: 4h work, 4h break, 4h work; Monday–Saturday (48 scheduled hours).
  const pattern = [1, 2, 3, 4, 5, 6].flatMap(weekday => [{ weekday, startMinute: 480, endMinute: 720, endDayOffset: 0 }, { weekday, startMinute: 960, endMinute: 1200, endDayOffset: 0 }]);
  for (const key of ["commission", "employee", "colleague", "onhold"]) {
    const e = employees[key];
    // Historical evidence is seeded directly only inside this disposable database; current schedules use the real service.
    await db.workSchedule.create({ data: { employeeId: e.employeeId, employmentPeriodId: e.periodId, effectiveFrom: new Date(addDays(lastWeek, -7)), effectiveUntil: new Date(today), createdBy: admin.id, label: "Standard split shift", changeReason: "Synthetic historical schedule", slots: { create: pattern } } });
    await schedules.publishSchedule(identity(admin.id), { employeeId: e.employeeId, employmentPeriodId: e.periodId, effectiveFrom: today, effectiveUntil: "", label: "Standard split shift", reason: "Synthetic QA schedule", slots: pattern });
  }
  for (const key of ["commission", "employee"]) for (let offset = 0; offset < 6; offset++) {
    const e = employees[key], date = addDays(lastWeek, offset), midnight = dayStart(date, zone).getTime();
    for (const [start, end] of [[8, 12.5], [16, 20.5]]) {
      const id = await corrections.submitCorrection(identity(e.userId), { type: "ADD", workDate: date, checkinAt: new Date(midnight + start * 3600000).toISOString(), checkoutAt: new Date(midnight + end * 3600000).toISOString(), reason: "Synthetic attendance evidence", operationKey: randomUUID() });
      await corrections.decideCorrection(identity(hr.id), { id, decision: "APPROVED", comment: "Synthetic evidence verified" });
    }
    await overtime.calculateOvertime(identity(hr.id), { employeeId: e.employeeId, week: lastWeek });
  }
  await tasks.assignTasks(identity(hr.id), { employeeIds: [employees.commission.employeeId, employees.employee.employeeId, employees.colleague.employeeId], title: "Complete the quarterly safety checklist", description: "Review the checklist and confirm each item for your area.", assignedDate: today, dueDate: addDays(today, 3), priority: "HIGH", operationKey: randomUUID() });
  await tasks.assignTasks(identity(hr.id), { employeeIds: [employees.employee.employeeId], title: "Update the support handover notes", description: "Summarize open customer cases for the next shift.", assignedDate: addDays(today, -2), dueDate: addDays(today, -1), priority: "NORMAL", operationKey: randomUUID() });
  await absence.requestDatedLeave(identity(employees.employee.userId), { startDate: addDays(thisWeek, 9), endDate: addDays(thisWeek, 10), type: "PAID", category: "ANNUAL", reason: "Synthetic family event", operationKey: randomUUID() });
  await controls.setCommissionEligibility(identity(admin.id), { employeeId: employees.commission.employeeId, enabled: true, reason: "Synthetic pre-order programme participant" });
  // Staff record a verified pre-order after the eligibility grant instant (employees cannot set amounts).
  await new Promise(done => setTimeout(done, 1500));
  const grant = (await commissions.commissionOptions(identity(admin.id))).grants.find(g => g.employeeId === employees.commission.employeeId)!;
  await commissions.submitPreorder(identity(admin.id), { employeeId: employees.commission.employeeId, eligibilityEvidenceId: grant.id, orderAt: new Date(Math.floor((Date.now() - 500) / 1000) * 1000).toISOString(), reference: "QA-PRE-1001", orderValue: "", commissionType: "FIXED", commissionValue: "500", reason: "Synthetic verified pre-order" }, true);
  await records.createRecord(identity(hr.id), "performance", { employeeId: employees.employee.employeeId, employmentPeriodId: employees.employee.periodId, employeeVisible: true, staffNotes: "Private synthetic staff note", startDate: addDays(today, -90), endDate: today, overallRating: 4, productivity: 4, workQuality: 4, communication: 5, attendance: 4, responsibility: 4, strengths: "Clear customer communication.", improvementAreas: "Document handovers sooner.", reviewerComments: "Strong quarter overall." });
  const asset = await assets.createAsset(identity(hr.id), { assetCode: "QA-LAP-01", type: "LAPTOP", name: "Synthetic support laptop", serialNumber: "SN-QA-0001", condition: "Good", status: "AVAILABLE", notes: "" });
  await assets.assignAsset(identity(hr.id), { assetId: asset, employeeId: employees.employee.employeeId, assignedDate: addDays(today, -30), conditionOut: "Good", notes: "" });
  await controls.changeEmployeeStatus(identity(admin.id), { employeeId: employees.onhold.employeeId, status: "ON_HOLD", reason: "Synthetic hold for QA" });
  await controls.changeEmployeeStatus(identity(admin.id), { employeeId: employees.suspended.employeeId, status: "SUSPENDED", reason: "Synthetic suspension for QA" });
  const accounts = { note: "LOCAL QA ONLY. Synthetic accounts in the disposable .local/qa database. All share this generated password.", url: `${base}/login`, password,
    accounts: { admin: admin.email, hr: hr.email, ...Object.fromEntries(people.map(p => [p.key, p.email])) } };
  writeFileSync(accountsFile, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  await db.$disconnect();
  return true;
}
try {
  await requireFreePort(port); await requireFreePort(config.databasePort);
  console.log("Starting the disposable local QA PostgreSQL (loopback only)...");
  if (!existsSync(resolve(dataDirectory, "PG_VERSION"))) await server.initialise();
  await server.start(); started = true;
  const maintenance = new pg.Client({ connectionString: ownerUrl.replace("/employee_qa", "/postgres") });
  await maintenance.connect();
  try { if (!(await maintenance.query("SELECT 1 FROM pg_database WHERE datname='employee_qa'")).rowCount) await maintenance.query("CREATE DATABASE employee_qa"); } finally { await maintenance.end(); }
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  try { if (!(await owner.query("SELECT 1 FROM pg_roles WHERE rolname='employee_runtime'")).rowCount) await owner.query(`CREATE ROLE employee_runtime LOGIN PASSWORD '${config.runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`); } finally { await owner.end(); }
  console.log("Applying migrations and runtime grants to the local QA database only...");
  tool(["node_modules/prisma/build/index.js", "migrate", "deploy"]); tool(["--import", "tsx", "scripts/runtime-grants.ts"]);
  if (await seed()) console.log(`Seeded synthetic QA records. Credentials: ${relative(resolve("."), accountsFile)}`);
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: mode === "prod" ? "production" : "development", DATABASE_URL: runtimeUrl, AUTH_SECRET: config.authSecret, APP_BASE_URL: base, AUTH_URL: base,
    ALLOW_LOCAL_HTTP: "true", PRIVATE_DOCUMENTS_DIR: documents, TZ: "UTC", NEXT_TELEMETRY_DISABLED: "1", PORT: String(port), HOSTNAME: "127.0.0.1" };
  delete env.MIGRATION_DATABASE_URL;
  // Email verification links are shown on screen only in local development (the service also refuses this in production).
  if (mode === "dev") env.ALLOW_DEV_EMAIL_PREVIEW = "true";
  if (mode === "prod") {
    if (!existsSync(".next/standalone/server.js")) throw new Error("Run `npm run build` before --mode=prod.");
    cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
    app = spawn(process.execPath, [".next/standalone/server.js"], { env, stdio: "inherit" });
  } else app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: "inherit" });
  console.log(`Local QA (${mode}) at ${base}/login — Ctrl+C stops the app and the QA database, preserving data.`);
  app.once("exit", code => { if (!stopping) void stop(code ?? 1); });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Local QA startup failed.");
  await stop(1);
}
