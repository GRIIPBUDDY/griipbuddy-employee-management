"use server";
import { revalidatePath } from "next/cache";
import { assertMutationOrigin, getIdentity } from "@/lib/auth/request";
import { safeMessage } from "@/lib/utils/errors";
import type { ActionState } from "@/types/auth";
import { updateBranding, updateRules, updateModules, createOption, updateOption } from "./organization";
import { modules } from "./options";
import { setLeaveAllowance } from "@/features/review/leave-balance";
import { updatePayout } from "@/features/pay/payout";
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
/** Organization configuration forms: branding, rules, module switches, editable lists, leave allowances and payout details. */
export async function configAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertMutationOrigin(); const identity = await getIdentity(), kind = text(form, "kind");
    let success: string;
    switch (kind) {
      case "branding": await updateBranding(identity, { companyName: text(form, "companyName"), companyLegalName: text(form, "companyLegalName"), companyAddress: text(form, "companyAddress"), brandColor: text(form, "brandColor") }); success = "Branding saved."; break;
      case "rules": await updateRules(identity, { earlyCheckinMinutes: text(form, "earlyCheckinMinutes"), lateGraceMinutes: text(form, "lateGraceMinutes"), workingDays: form.getAll("workingDays").map(String), leaveDayBasis: text(form, "leaveDayBasis"), leaveOverBalance: text(form, "leaveOverBalance"), salaryPaymentDay: text(form, "salaryPaymentDay") }); success = "Rules saved."; break;
      case "modules": await updateModules(identity, Object.fromEntries(modules.map(m => [m.key, form.has(m.key)]))); success = "Modules updated."; break;
      case "optionCreate": case "optionUpdate": {
        const input = { list: text(form, "list"), code: text(form, "code"), label: text(form, "label"), sortOrder: text(form, "sortOrder") || "100", ...(form.has("kindValue") ? { kind: text(form, "kindValue") } : {}), ...(text(form, "list") === "LEAVE_CATEGORY" ? { paid: form.has("paid"), yearlyDays: text(form, "yearlyDays") } : {}) };
        if (kind === "optionCreate") await createOption(identity, input); else await updateOption(identity, { ...input, isActive: form.has("isActive"), revision: text(form, "revision") });
        success = kind === "optionCreate" ? "Option added." : "Option saved."; break;
      }
      case "allowance": await setLeaveAllowance(identity, { employeeId: text(form, "employeeId"), year: text(form, "year"), category: text(form, "category"), days: text(form, "days"), reason: text(form, "reason") }); success = "Leave allowance saved."; break;
      case "payout": await updatePayout(identity, { employeeId: text(form, "employeeId"), method: text(form, "method"), accountName: text(form, "accountName"), accountNumber: text(form, "accountNumber"), bankName: text(form, "bankName"), branch: text(form, "branch"), routingNumber: text(form, "routingNumber"), reason: text(form, "reason") }); success = "Payment details saved."; break;
      default: return { error: "Unsupported action." };
    }
    revalidatePath("/", "layout");
    return { success };
  } catch (error) { return { error: safeMessage(error) }; }
}
