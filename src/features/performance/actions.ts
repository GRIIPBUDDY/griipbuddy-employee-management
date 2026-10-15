"use server";
import { revalidatePath } from "next/cache";
import { assertMutationOrigin, getIdentity } from "@/lib/auth/request";
import { safeMessage } from "@/lib/utils/errors";
import type { ActionState } from "@/types/auth";
import { createTargets, editTarget, recordTargetResult, cancelTarget, saveManualAssessment, finalizeAssessment, reopenAssessment, updateWarningDeductions } from "./service";
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
/** Target, rating and warning-deduction forms. Every rule and permission is enforced by the service. */
export async function performanceAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertMutationOrigin(); const identity = await getIdentity(), kind = text(form, "kind"), ref = { id: text(form, "id"), revision: text(form, "revision") };
    const target = { title: text(form, "title"), description: text(form, "description"), targetValue: text(form, "targetValue"), unit: text(form, "unit"), notes: text(form, "notes") };
    const assessment = { employeeId: text(form, "employeeId"), month: text(form, "month"), revision: text(form, "revision") };
    let success: string;
    switch (kind) {
      case "createTarget": { const ids = await createTargets(identity, { ...target, employeeIds: form.getAll("employeeIds").map(String), periodType: text(form, "periodType"), periodDate: text(form, "periodDate") }); success = `Target assigned to ${ids.length} employee${ids.length === 1 ? "" : "s"}.`; break; }
      case "editTarget": await editTarget(identity, { ...ref, ...target }); success = "Target updated."; break;
      case "result": await recordTargetResult(identity, { ...ref, actualValue: text(form, "actualValue"), note: text(form, "note") }); success = "Result recorded."; break;
      case "cancelTarget": await cancelTarget(identity, { ...ref, reason: text(form, "reason") }); success = "Target cancelled."; break;
      case "manual": await saveManualAssessment(identity, { ...assessment, manualScore: text(form, "manualScore"), comment: text(form, "comment"), privateNote: text(form, "privateNote") }); success = "Manual assessment saved."; break;
      case "finalize": await finalizeAssessment(identity, assessment); success = "Monthly rating finalized."; break;
      case "reopen": await reopenAssessment(identity, { ...assessment, reason: text(form, "reason") }); success = "Rating reopened for correction."; break;
      case "deductions": await updateWarningDeductions(identity, { NOTICE: text(form, "NOTICE"), WARNING: text(form, "WARNING"), SERIOUS_WARNING: text(form, "SERIOUS_WARNING"), FINAL_WARNING: text(form, "FINAL_WARNING") }); success = "Warning deductions saved."; break;
      default: return { error: "Unknown action." };
    }
    revalidatePath("/manage/ratings", "layout"); revalidatePath("/manage/targets"); revalidatePath("/me/ratings"); revalidatePath("/manage/settings");
    return { success };
  } catch (error) { return { error: safeMessage(error) }; }
}
