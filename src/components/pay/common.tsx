import { pageActor } from "@/lib/auth/request";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { TabNav } from "@/components/ui/tabs";
import { Hidden } from "@/components/review/forms";
import { payAction } from "@/features/pay/actions";
import { enabledModules } from "@/features/settings/config";
export { ActionForm, Field, SelectField, Hidden, payAction };
export const label = (s: string) => s === "REVIEWED" ? "Under review" : s[0] + s.slice(1).toLowerCase().replaceAll("_", " ");
export async function PayNav() {
  const actor = await pageActor(), on = await enabledModules();
  return <TabNav label="Compensation" items={[...(on.weeklyEarnings ? [{ label: "Weekly earnings", href: "/manage/weekly-earnings" }] : []), { label: "Salary & payments", href: "/manage/salary" }, { label: "Adjustments", href: "/manage/adjustments" }, ...(on.commissions && (actor.role === "ADMIN" || actor.canManageCommissions) ? [{ label: "Pre-order commissions", href: "/manage/commissions" }] : [])]} />;
}
export function PayDecision({ kind, id, revision }: { kind: "adjustmentDecision" | "preorderDecision"; id: string; revision: number }) {
  return <ActionForm action={payAction} submitLabel="Save decision" confirmation={{ title: "Record this financial decision?", description: "Approved items become eligible for earnings calculations. Rejected items are kept in history and excluded.", label: "Confirm decision" }}><Hidden values={{ kind, id, revision }} /><SelectField name="decision" label="Decision"><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option></SelectField><Field name="comment" label="Review comment" maxLength={500} /></ActionForm>;
}
