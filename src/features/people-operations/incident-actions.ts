"use server";
import { revalidatePath } from "next/cache";
import { assertMutationOrigin, getIdentity } from "@/lib/auth/request";
import { safeMessage } from "@/lib/utils/errors";
import type { ActionState } from "@/types/auth";
import { createIncident, editIncident, submitIncident, decideIncident, recordCorrectiveAction, completeFollowUp, resolveIncident, reopenIncident, setIncidentVisibility, setIncidentEvidence, acknowledgeIncident, respondToIncident } from "./incidents";
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const details = (form: FormData) => ({ category: text(form, "category"), title: text(form, "title"), description: text(form, "description"), impact: text(form, "impact"), severity: text(form, "severity"), occurredOn: text(form, "occurredOn"), occurredTime: text(form, "occurredTime"), staffNotes: text(form, "staffNotes"),
  relatedTaskId: text(form, "relatedTaskId"), relatedSessionId: text(form, "relatedSessionId"), relatedActivityId: text(form, "relatedActivityId"), relatedWarningId: text(form, "relatedWarningId"), relatedReviewId: text(form, "relatedReviewId") });
/** Incident & performance record forms. Every rule and permission is enforced by the service. */
export async function incidentAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertMutationOrigin(); const identity = await getIdentity(), kind = text(form, "kind"), ref = { id: text(form, "id"), revision: text(form, "revision") };
    let success: string;
    switch (kind) {
      case "create": await createIncident(identity, { employeeId: text(form, "employeeId"), data: details(form) }); success = "Record created as a draft."; break;
      case "edit": await editIncident(identity, { ...ref, data: details(form), reason: text(form, "reason") }); success = "Record updated."; break;
      case "submit": await submitIncident(identity, ref); success = "Submitted for review."; break;
      case "decide": await decideIncident(identity, { ...ref, decision: text(form, "decision"), note: text(form, "note") }); success = "Review decision recorded."; break;
      case "corrective": await recordCorrectiveAction(identity, { ...ref, action: text(form, "action"), note: text(form, "note"), followUpOn: text(form, "followUpOn"), relatedWarningId: text(form, "relatedWarningId") }); success = "Corrective action recorded."; break;
      case "complete": await completeFollowUp(identity, { ...ref, note: text(form, "note") }); success = "Follow-up marked complete."; break;
      case "resolve": await resolveIncident(identity, { ...ref, outcome: text(form, "outcome"), note: text(form, "note") }); success = text(form, "outcome") === "CLOSED" ? "Record closed." : "Record resolved."; break;
      case "reopen": await reopenIncident(identity, { ...ref, note: text(form, "note") }); success = "Record reopened for review."; break;
      case "visibility": await setIncidentVisibility(identity, { ...ref, employeeVisible: form.has("employeeVisible"), responseRequested: form.has("responseRequested") }); success = "Employee access updated."; break;
      case "evidence": await setIncidentEvidence(identity, { ...ref, documentId: text(form, "documentId") }); success = text(form, "documentId") ? "Evidence linked." : "Evidence removed."; break;
      case "acknowledge": await acknowledgeIncident(identity, ref); success = "Receipt acknowledged. This does not mean you agree."; break;
      case "respond": await respondToIncident(identity, { ...ref, response: text(form, "response"), disputes: text(form, "position") === "DISPUTE" }); success = "Your response was recorded."; break;
      default: return { error: "Unsupported action." };
    }
    revalidatePath("/", "layout");
    return { success };
  } catch (error) { return { error: safeMessage(error) }; }
}
