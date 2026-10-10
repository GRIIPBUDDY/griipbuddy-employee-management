import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { redactAudit } from "./audit-redaction";
import { db } from "./client";
export type Database = Prisma.TransactionClient;
type Audit = { actorUserId?: string; employeeId?: string; action: string; entity: string; entityId?: string; reason?: string; before?: Prisma.InputJsonObject; after?: Prisma.InputJsonObject; systemSource?: string };
export async function audit(data: Audit, client: Database = db) {
  await client.auditLog.create({ data: { ...data, ...(data.before?{before:redactAudit(data.before) as Prisma.InputJsonObject}:{}), ...(data.after?{after:redactAudit(data.after) as Prisma.InputJsonObject}:{}), requestId: randomUUID(), systemSource: data.actorUserId ? undefined : data.systemSource ?? "security" } });
}
