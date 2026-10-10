import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit, type Database } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { validated, uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
export type CatalogKind = "departments" | "positions";
export function catalogKind(input: unknown): CatalogKind { return validated(z.enum(["departments", "positions"]), input); }
const nameSchema = z.string().trim().min(1).max(100);
const createSchema = z.object({ name: nameSchema }).strict();
const updateSchema = z.object({ id: uuidSchema, name: nameSchema, isActive: z.boolean(), expectedUpdatedAt: z.iso.datetime(), reason: z.string().trim().min(1).max(500) }).strict();
const safeSelect = { id: true, name: true, isActive: true, updatedAt: true };
function model(tx: Database, kind: CatalogKind) {
  return {
    list: () => kind === "departments" ? tx.department.findMany({ orderBy: { name: "asc" }, select: safeSelect }) : tx.position.findMany({ orderBy: { name: "asc" }, select: safeSelect }),
    find: (where: { id: string } | { normalizedName: string }) => kind === "departments" ? tx.department.findUnique({ where }) : tx.position.findUnique({ where }),
    create: (data: { name: string; normalizedName: string; createdBy: string }) => kind === "departments" ? tx.department.create({ data }) : tx.position.create({ data }),
    update: (id: string, data: { name: string; normalizedName: string; isActive: boolean }) => kind === "departments" ? tx.department.update({ where: { id }, data }) : tx.position.update({ where: { id }, data }),
  };
}
async function normalized(tx: Database, name: string) { return (await tx.$queryRaw<{ name: string }[]>`SELECT lower(btrim(${name})) AS name`)[0].name; }
function duplicate(error: unknown): never {
  if (typeof error === "object" && error && "code" in error && error.code === "P2002") throw new AppError(409, "DUPLICATE", "This catalog name already exists, including inactive entries.");
  throw error;
}
export async function listCatalog(identity: Identity | null, inputKind: unknown) {
  return securityBoundary(identity, async actor => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]); const kind = catalogKind(inputKind);
    return model(db, kind).list();
  });
}
export async function createCatalog(identity: Identity | null, inputKind: unknown, input: unknown) {
  await securityBoundary(identity, async actor => assertRole(actor, ["ADMIN", "HR_MANAGER"]));
  const kind = catalogKind(inputKind), value = validated(createSchema, input);
  try { return await authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    const record = await model(tx, kind).create({ name: value.name, normalizedName: await normalized(tx, value.name), createdBy: actor.userId });
    await audit({ actorUserId: actor.userId, action: "CATALOG_CREATED", entity: kind, entityId: record.id, after: { name: record.name, isActive: true } }, tx);
    return record.id;
  }); } catch (error) { duplicate(error); }
}
export async function updateCatalog(identity: Identity | null, inputKind: unknown, input: unknown) {
  await securityBoundary(identity, async actor => assertRole(actor, ["ADMIN", "HR_MANAGER"]));
  const kind = catalogKind(inputKind), value = validated(updateSchema, input);
  try { return await authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN", "HR_MANAGER"]);
    const before = await model(tx, kind).find({ id: value.id });
    if (!before) throw new AppError(404, "NOT_FOUND", "Catalog entry not found.");
    if (before.updatedAt.toISOString() !== value.expectedUpdatedAt) throw new AppError(409, "STALE", "This entry changed. Reload before editing.");
    await model(tx, kind).update(before.id, { name: value.name, normalizedName: await normalized(tx, value.name), isActive: value.isActive });
    await audit({ actorUserId: actor.userId, action: "CATALOG_CHANGED", entity: kind, entityId: before.id, reason: value.reason,
      before: { name: before.name, isActive: before.isActive }, after: { name: value.name, isActive: value.isActive } }, tx);
  }); } catch (error) { duplicate(error); }
}
// Compatibility for the existing account provisioning form and integrations that use labels.
// All callers are staff-authorized mutations; creating a missing label is audited atomically.
export async function resolveEmploymentCatalogs(tx: Database, actorUserId: string, input: { departmentId?: string | null; positionId?: string | null; departmentLabel: string; positionLabel: string }, previous?: { departmentId: string | null; positionId: string | null; departmentLabel: string; positionLabel: string }) {
  async function resolve(kind: CatalogKind, id: string | null | undefined, label: string, previousId?: string | null) {
    let record = id ? await model(tx, kind).find({ id }) : await model(tx, kind).find({ normalizedName: await normalized(tx, label) });
    if (id && !record) throw new AppError(400, "CATALOG_INVALID", "Choose an existing department or position.");
    if (record && !record.isActive && record.id !== previousId) throw new AppError(409, "CATALOG_INACTIVE", "Choose an active department or position.");
    if (!record) {
      if (!label) throw new AppError(400, "VALIDATION", "Choose a department and position.");
      record = await model(tx, kind).create({ name: label.trim(), normalizedName: await normalized(tx, label), createdBy: actorUserId });
      await audit({ actorUserId, action: "CATALOG_CREATED", entity: kind, entityId: record.id, after: { name: record.name, isActive: true } }, tx);
    }
    return record;
  }
  const department = await resolve("departments", input.departmentId, input.departmentLabel, previous?.departmentId);
  const position = await resolve("positions", input.positionId, input.positionLabel, previous?.positionId);
  return { departmentId: department.id, positionId: position.id, departmentLabel: department.id === previous?.departmentId ? previous!.departmentLabel : department.name, positionLabel: position.id === previous?.positionId ? previous!.positionLabel : position.name };
}
