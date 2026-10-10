"use server";
import { getIdentity, assertMutationOrigin } from "@/lib/auth/request";
import { revalidatePath } from "next/cache";
import { safeMessage } from "@/lib/utils/errors";
import type { ActionState } from "@/types/auth";
import { createCatalog, updateCatalog, catalogKind } from "./catalogs";
export async function createCatalogAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { await assertMutationOrigin(); const kind = catalogKind(form.get("kind"));
    await createCatalog(await getIdentity(), kind, { name: String(form.get("name") ?? "") });
    revalidatePath("/manage", "layout"); return { success: "Entry created." };
  } catch (error) { return { error: safeMessage(error) }; }
}
export async function updateCatalogAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { await assertMutationOrigin(); const kind = catalogKind(form.get("kind"));
    await updateCatalog(await getIdentity(), kind, { id: String(form.get("id") ?? ""), name: String(form.get("name") ?? ""), expectedUpdatedAt: String(form.get("expectedUpdatedAt") ?? ""), isActive: form.get("isActive") === "on", reason: String(form.get("reason") ?? "") });
    revalidatePath("/manage", "layout"); return { success: "Entry updated. Existing employment history is preserved." };
  } catch (error) { return { error: safeMessage(error) }; }
}
