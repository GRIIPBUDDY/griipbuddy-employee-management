import "server-only";
import { db } from "@/lib/db/client";
import type { Database } from "@/lib/db/audit";
import { AppError } from "@/lib/utils/errors";
import { modules, type ModuleKey, type OptionList } from "./options";
export { modules, optionLists, type ModuleKey, type OptionList } from "./options";
/** Enabled state per optional module. A missing key means the module's default. */
export function moduleState(stored: unknown): Record<ModuleKey, boolean> {
  const value = stored && typeof stored === "object" ? stored as Record<string, unknown> : {};
  return Object.fromEntries(modules.map(m => [m.key, typeof value[m.key] === "boolean" ? value[m.key] as boolean : m.default])) as Record<ModuleKey, boolean>;
}
export async function enabledModules(client: Database = db) {
  return moduleState((await client.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { enabledModules: true } })).enabledModules);
}
/** Server-side gate: a switched-off module behaves like a page that does not exist. */
export async function requireModule(key: ModuleKey, client: Database = db) {
  if (!(await enabledModules(client))[key]) throw new AppError(404, "MODULE_DISABLED", "This page is not available.");
}
export type OptionItemView = { code: string; label: string; isActive: boolean; attributes: Record<string, unknown> };
export async function optionItems(list: OptionList, client: Database = db, includeInactive = false): Promise<OptionItemView[]> {
  const rows = await client.optionItem.findMany({ where: { list, ...(includeInactive ? {} : { isActive: true }) }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { code: true, label: true, isActive: true, attributes: true } });
  return rows.map(r => ({ ...r, attributes: (r.attributes ?? {}) as Record<string, unknown> }));
}
/** Label lookup that keeps historical (inactive) codes readable. */
export async function optionLabels(list: OptionList, client: Database = db) {
  return Object.fromEntries((await optionItems(list, client, true)).map(i => [i.code, i.label])) as Record<string, string>;
}
/** New records may only use active codes; unchanged historical values stay valid on edit. */
export async function assertOption(client: Database, list: OptionList, code: string, previous?: string | null) {
  if (previous && previous === code) return;
  if (!await client.optionItem.count({ where: { list, code, isActive: true } })) throw new AppError(400, "OPTION_INVALID", "Choose an available option from the list.");
}
/** What the app shell needs from settings on every page — company name, logo revision and module switches — in one read. */
export async function shellSettings() {
  const s = await db.organizationSettings.findUnique({ where: { id: 1 }, select: { companyName: true, logoRevision: true, enabledModules: true } });
  return { companyName: s?.companyName ?? "GriipBuddy People", logoRevision: s?.logoRevision ?? 0, modules: moduleState(s?.enabledModules) };
}
