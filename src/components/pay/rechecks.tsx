import { commissionRechecks } from "@/features/pay/rechecks";
import { payAction } from "@/features/pay/actions";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextAreaField } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Identity } from "@/types/auth";
import { pageResult } from "@/lib/auth/page-result";
import { displayInstant } from "@/features/time/dates";
/** Auditable recheck queue. `names`/`references` resolve identifiers already visible on the page. */
export async function Rechecks({ identity, staff = false, timezone, references = {}, names = {} }: { identity: Identity | null; staff?: boolean; timezone: string; references?: Record<string, string>; names?: Record<string, string> }) {
  const rows = await pageResult(commissionRechecks(identity, staff));
  return <Card><CardHeader><CardTitle>Recheck requests</CardTitle><CardDescription>{staff ? "Employee requests to verify a recorded amount. Resolutions are audited and the employee is notified." : "Your requests and their outcome."}</CardDescription></CardHeader><CardContent>{!rows.length ? <p className="text-sm text-muted-foreground">No recheck requests.</p> :
    <TableContainer label="Recheck requests" flush className="rounded-lg border"><table className="data-table min-w-[720px]"><thead><tr>{staff && <th>Employee</th>}<th>Pre-order</th><th>Request</th><th>Submitted</th><th>Status</th>{staff && <th className="text-right">Action</th>}</tr></thead><tbody>{rows.map(r => <tr key={r.id}>
      {staff && <td className="font-medium">{names[r.employeeId] ?? "Employee"}</td>}<td>{references[r.preorderId] ?? "Pre-order"}</td>
      <td className="max-w-80"><p className="font-medium">{r.reason}</p>{r.explanation && <p className="line-clamp-2 text-xs text-muted-foreground">{r.explanation}</p>}{r.reviewComment && <p className="mt-1 text-xs">Resolution: {r.reviewComment}</p>}</td>
      <td className="whitespace-nowrap text-[13px] text-muted-foreground">{displayInstant(r.createdAt, timezone)}</td><td><StatusBadge status={r.status} /></td>
      {staff && <td className="text-right">{r.status === "PENDING" ? <Dialog triggerSize="sm" variant="default" trigger="Resolve" title="Resolve recheck request" description={`${references[r.preorderId] ?? "Pre-order"} · ${r.reason}`}><ActionForm action={payAction} submitLabel="Save resolution" confirmation={{ title: "Resolve this request?", description: "The employee is notified. Corrections to amounts already included in a finalized statement require an approved controlled adjustment.", label: "Resolve" }}><input type="hidden" name="kind" value="recheckResolve" /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="revision" value={r.revision} />
        <SelectField name="decision" label="Outcome"><option value="CONFIRMED">Confirm the recorded amount</option><option value="REJECTED">Reject the request</option><option value="CORRECTED">Correct the amount</option></SelectField><TextAreaField name="comment" label="Explanation for the employee" required maxLength={500} rows={2} /><Field name="amount" label="Corrected total amount" inputMode="decimal" hint="Only for “Correct the amount”." />
        <details className="disclosure rounded-lg border px-3 py-2"><summary>Frozen statements</summary><div className="mt-3"><Field name="correctionAdjustmentId" label="Approved correction adjustment ID" hint="Required only when the pre-order is already part of a finalized statement. Find it on the Adjustments page." /></div></details></ActionForm></Dialog> : <span className="text-xs text-muted-foreground">{r.resolvedAt ? displayInstant(r.resolvedAt, timezone) : "—"}</span>}</td>}
    </tr>)}</tbody></table></TableContainer>}</CardContent></Card>;
}
