"use server";
import { revalidatePath } from "next/cache";
import { assertMutationOrigin, getIdentity } from "@/lib/auth/request";
import { safeMessage } from "@/lib/utils/errors";
import type { ActionState } from "@/types/auth";
import { createMissingTime, reviewMissingTime, reopenMissingTime, respondToMissingTime } from "./service";
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
/** Missing-time forms. Every rule and permission is enforced by the service. */
export async function missingTimeAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertMutationOrigin(); const identity = await getIdentity(), kind = text(form, "kind"), ref = { id: text(form, "id"), revision: text(form, "revision") };
    let success: string;
    switch (kind) {
      case "create": await createMissingTime(identity, { employeeId: text(form, "employeeId"), date: text(form, "date"), start: text(form, "start"), end: text(form, "end"), endsNextDay: form.has("endsNextDay"), category: text(form, "category"), reason: text(form, "reason"), evidenceNote: text(form, "evidenceNote") }); success = "Missing time recorded for review."; break;
      case "review": await reviewMissingTime(identity, { ...ref, decision: text(form, "decision"), note: text(form, "note") }); success = text(form, "decision") === "CONFIRMED" ? "Confirmed: the time is now unpaid." : "Rejected: pay is not affected."; break;
      case "reopen": await reopenMissingTime(identity, { ...ref, reason: text(form, "reason") }); success = "Record reopened for review."; break;
      case "respond": await respondToMissingTime(identity, { ...ref, response: text(form, "response") }); success = "Your response was recorded."; break;
      default: return { error: "Unknown action." };
    }
    revalidatePath("/manage/work-time"); revalidatePath("/me/work-time");
    return { success };
  } catch (error) { return { error: safeMessage(error) }; }
}
