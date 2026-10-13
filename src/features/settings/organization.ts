import "server-only";
import { z } from "zod";
import sharp from "sharp";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/db/audit";
import { authorizedMutation } from "@/lib/db/mutation";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { validated } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { contrastWithWhite, isHexColor } from "@/lib/branding/palette";
import { defaultLogoPng } from "@/lib/branding/default-logo";
import { modules, optionLists, adjustmentKinds, type OptionList } from "./options";
import { moduleState } from "./config";
const brandingSchema = z.object({
  companyName: z.string().trim().min(1).max(150),
  companyLegalName: z.string().trim().max(150),
  companyAddress: z.string().trim().max(500),
  brandColor: z.string().trim().toLowerCase().refine(isHexColor, "Choose a color such as #4b2a5e.").refine(v => contrastWithWhite(v) >= 4.5, "Choose a darker color so white text on buttons stays readable."),
}).strict();
const rulesSchema = z.object({
  earlyCheckinMinutes: z.coerce.number().int().min(0).max(60),
  lateGraceMinutes: z.coerce.number().int().min(0).max(120),
  workingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Choose at least one working day.").max(7).transform(v => [...new Set(v)].sort()),
  leaveDayBasis: z.enum(["WORKING", "CALENDAR"]),
  leaveOverBalance: z.enum(["BLOCK", "FLAG"]),
  salaryPaymentDay: z.union([z.literal(""), z.coerce.number().int().min(1).max(28)]).transform(v => v === "" ? null : v),
}).strict();
const modulesSchema = z.object(Object.fromEntries(modules.map(m => [m.key, z.boolean()])) as Record<typeof modules[number]["key"], z.ZodBoolean>).strict();
const listSchema = z.enum(optionLists.map(l => l.key) as [OptionList, ...OptionList[]]);
const attributesFor = (list: OptionList, input: { paid?: unknown; yearlyDays?: unknown; kind?: unknown }) => {
  if (list === "LEAVE_CATEGORY") return validated(z.object({ paid: z.boolean(), yearlyDays: z.union([z.literal(""), z.null(), z.coerce.number().min(0).max(366).multipleOf(0.5)]).transform(v => v === "" ? null : v) }), input);
  if (list === "ADJUSTMENT_CATEGORY") return validated(z.object({ kind: z.enum(Object.keys(adjustmentKinds) as [keyof typeof adjustmentKinds]) }), input);
  return {};
};
const optionSchema = z.object({ list: listSchema, code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{0,19}$/, "Use 1–20 capital letters, digits or underscores, starting with a letter."), label: z.string().trim().min(1).max(100), sortOrder: z.coerce.number().int().min(0).max(9999).default(100), paid: z.boolean().optional(), yearlyDays: z.unknown().optional(), kind: z.unknown().optional() }).strict();
const optionEditSchema = optionSchema.omit({ code: true }).extend({ code: z.string(), isActive: z.boolean(), revision: z.coerce.number().int().positive() }).strict();
async function admin(identity: Identity | null) { await securityBoundary(identity, async actor => assertRole(actor, ["ADMIN"])); }
/** Public branding: used on sign-in pages, the shell and every PDF. Never includes private settings. */
export async function branding() {
  const s = await db.organizationSettings.findUnique({ where: { id: 1 }, select: { companyName: true, companyLegalName: true, companyAddress: true, brandColor: true, logoRevision: true, timezone: true } });
  return { timezone: s?.timezone ?? "Asia/Dhaka", companyName: s?.companyName ?? "GriipBuddy People", legalName: s?.companyLegalName || s?.companyName || "GriipBuddy People", address: s?.companyAddress ?? "", brandColor: s?.brandColor ?? "#4b2a5e", logoRevision: s?.logoRevision ?? 0 };
}
export async function logoPng(): Promise<Buffer> {
  const s = await db.organizationSettings.findUnique({ where: { id: 1 }, select: { logoData: true } });
  return s?.logoData ? Buffer.from(s.logoData) : Buffer.from(defaultLogoPng, "base64");
}
export async function organizationConfig(identity: Identity | null) {
  return securityBoundary(identity, async actor => {
    assertRole(actor, ["ADMIN"]);
    const s = await db.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { companyName: true, companyLegalName: true, companyAddress: true, brandColor: true, logoRevision: true, logoMime: true, enabledModules: true, earlyCheckinMinutes: true, lateGraceMinutes: true, workingDays: true, leaveDayBasis: true, leaveOverBalance: true, salaryPaymentDay: true } });
    const options = await db.optionItem.findMany({ orderBy: [{ list: "asc" }, { sortOrder: "asc" }, { label: "asc" }], select: { id: true, list: true, code: true, label: true, sortOrder: true, isActive: true, attributes: true, revision: true } });
    return { ...s, customLogo: !!s.logoMime, workingDays: s.workingDays as number[], modules: moduleState(s.enabledModules), options: options.map(o => ({ ...o, attributes: o.attributes as Record<string, unknown> })) };
  });
}
export async function updateBranding(identity: Identity | null, input: unknown) {
  await admin(identity); const v = validated(brandingSchema, input);
  await authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN"]);
    const old = await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { companyName: true, companyLegalName: true, companyAddress: true, brandColor: true } });
    await tx.organizationSettings.update({ where: { id: 1 }, data: { ...v, changedBy: actor.userId } });
    await audit({ actorUserId: actor.userId, action: "BRANDING_CHANGED", entity: "organization_settings", entityId: "1", before: old, after: v }, tx);
  });
}
/** Accepts PNG, JPEG or WebP up to 2 MB; stores a normalized square-fit PNG (at most 512 px). */
export async function updateLogo(identity: Identity | null, file: unknown) {
  await admin(identity);
  if (!(file instanceof Blob) || file.size === 0) throw new AppError(400, "LOGO_REQUIRED", "Choose a logo image.");
  if (file.size > 2 * 1024 * 1024) throw new AppError(400, "LOGO_SIZE", "The logo must be 2 MB or smaller.");
  let png: Buffer;
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25_000_000 }), meta = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(meta.format ?? "")) throw new Error("format");
    png = await image.rotate().resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  } catch { throw new AppError(400, "LOGO_FORMAT", "Upload a PNG, JPEG or WebP image."); }
  if (png.length > 1024 * 1024) throw new AppError(400, "LOGO_SIZE", "The processed logo is too large. Use a simpler image.");
  await authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN"]);
    const row = await tx.organizationSettings.update({ where: { id: 1 }, data: { logoData: new Uint8Array(png), logoMime: "image/png", logoRevision: { increment: 1 }, changedBy: actor.userId } });
    await audit({ actorUserId: actor.userId, action: "LOGO_CHANGED", entity: "organization_settings", entityId: "1", after: { logoRevision: row.logoRevision, bytes: png.length } }, tx);
  });
}
export async function resetLogo(identity: Identity | null) {
  await admin(identity);
  await authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN"]);
    const row = await tx.organizationSettings.update({ where: { id: 1 }, data: { logoData: null, logoMime: null, logoRevision: { increment: 1 }, changedBy: actor.userId } });
    await audit({ actorUserId: actor.userId, action: "LOGO_RESET", entity: "organization_settings", entityId: "1", after: { logoRevision: row.logoRevision } }, tx);
  });
}
export async function updateRules(identity: Identity | null, input: unknown) {
  await admin(identity); const v = validated(rulesSchema, input);
  await authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN"]);
    const old = await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { earlyCheckinMinutes: true, lateGraceMinutes: true, workingDays: true, leaveDayBasis: true, leaveOverBalance: true, salaryPaymentDay: true } });
    await tx.organizationSettings.update({ where: { id: 1 }, data: { ...v, changedBy: actor.userId, rulesVersion: { increment: 1 } } });
    await audit({ actorUserId: actor.userId, action: "RULES_CHANGED", entity: "organization_settings", entityId: "1", before: old, after: v }, tx);
  });
}
export async function updateModules(identity: Identity | null, input: unknown) {
  await admin(identity); const v = validated(modulesSchema, input);
  await authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN"]);
    const old = moduleState((await tx.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { enabledModules: true } })).enabledModules);
    await tx.organizationSettings.update({ where: { id: 1 }, data: { enabledModules: v, changedBy: actor.userId } });
    await audit({ actorUserId: actor.userId, action: "MODULES_CHANGED", entity: "organization_settings", entityId: "1", before: old, after: v }, tx);
  });
}
export async function createOption(identity: Identity | null, input: unknown) {
  await admin(identity); const v = validated(optionSchema, input), attributes = attributesFor(v.list, v);
  return authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN"]);
    if (await tx.optionItem.count({ where: { list: v.list, code: v.code } })) throw new AppError(409, "OPTION_EXISTS", "That code already exists in this list. Edit or reactivate it instead.");
    const row = await tx.optionItem.create({ data: { list: v.list, code: v.code, label: v.label, sortOrder: v.sortOrder, attributes, createdBy: actor.userId } });
    await audit({ actorUserId: actor.userId, action: "OPTION_CREATED", entity: "option_items", entityId: row.id, after: { list: v.list, code: v.code, label: v.label, attributes } }, tx);
    return row.id;
  });
}
export async function updateOption(identity: Identity | null, input: unknown) {
  await admin(identity); const v = validated(optionEditSchema, input), attributes = attributesFor(v.list, v);
  await authorizedMutation(identity, async (actor, tx) => {
    assertRole(actor, ["ADMIN"]);
    const old = await tx.optionItem.findUnique({ where: { list_code: { list: v.list, code: v.code } } });
    if (!old) throw new AppError(404, "NOT_FOUND", "Option not found.");
    if (old.revision !== v.revision) throw new AppError(409, "STALE", "This option changed since the page loaded. Refresh and try again.");
    if (!v.isActive && old.isActive && await tx.optionItem.count({ where: { list: v.list, isActive: true } }) <= 1) throw new AppError(409, "LAST_OPTION", "Keep at least one active option in each list.");
    await tx.optionItem.update({ where: { id: old.id }, data: { label: v.label, sortOrder: v.sortOrder, isActive: v.isActive, attributes, revision: { increment: 1 } } });
    await audit({ actorUserId: actor.userId, action: "OPTION_CHANGED", entity: "option_items", entityId: old.id, before: { label: old.label, isActive: old.isActive, attributes: old.attributes }, after: { label: v.label, isActive: v.isActive, attributes } }, tx);
  });
}
