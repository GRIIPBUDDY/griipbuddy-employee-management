"use server";
import { assertMutationOrigin, getIdentity } from "@/lib/auth/request";
import { updateSettings } from "./service";
import { revalidatePath } from "next/cache";
import { safeMessage } from "@/lib/utils/errors";
import type { ActionState } from "@/types/auth";
export async function settingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertMutationOrigin();
    await updateSettings(await getIdentity(), { companyName: form.get("companyName"), timezone: form.get("timezone"), earlyCheckinMinutes: form.get("earlyCheckinMinutes"), ...(form.has("currency") ? {currency: form.get("currency")} : {}) });
    revalidatePath("/", "layout");
    return { success: "Organization settings saved." };
  } catch (error) { return { error: safeMessage(error) }; }
}
