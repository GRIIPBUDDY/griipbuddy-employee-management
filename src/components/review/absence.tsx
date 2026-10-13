import { randomUUID } from "node:crypto";
import { CalendarPlus, Palmtree, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextAreaField, FieldGrid } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { reviewAction } from "@/features/review/actions";
import type { absenceData } from "@/features/review/absence";
import { dateKey, displayInstant, localDate } from "@/features/time/dates";
import { rangeLabel } from "@/lib/utils/date-range";
import { Hidden, DecisionForm } from "./forms";
type Data = Awaited<ReturnType<typeof absenceData>>;
const words = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase());
export const leaveCategories = ["ANNUAL", "SICK", "PERSONAL", "EMERGENCY", "UNPAID", "OTHER"];
export function RequestLeaveButton({ timezone }: { timezone: string }) {
  return <Dialog variant="default" trigger={<><Plus size={16} aria-hidden="true" />Request leave</>} title="Request leave" description={`Whole dates in ${timezone}, including the last day. Approved leave excuses scheduled work; it adds no worked hours or overtime.`}>
    <ActionForm action={reviewAction} submitLabel="Submit leave request"><Hidden values={{ kind: "datedLeave", operationKey: randomUUID() }} />
      <FieldGrid><Field label="First day" name="startDate" type="date" required /><Field label="Last day (inclusive)" name="endDate" type="date" required /></FieldGrid>
      <FieldGrid><SelectField label="Leave type" name="category">{leaveCategories.map(t => <option key={t} value={t}>{words(t)}</option>)}</SelectField><SelectField label="Requested pay treatment" name="type" hint="Unpaid leave must use unpaid treatment."><option value="PAID">Paid</option><option value="UNPAID">Unpaid</option></SelectField></FieldGrid>
      <TextAreaField label="Reason" name="reason" required maxLength={500} rows={3} />
    </ActionForm></Dialog>;
}
export function Absence({ data, staff }: { data: Data; staff: boolean }) {
  const tz = data.timezone, last = (end: Date) => localDate(new Date(end.getTime() - 1000), tz);
  return <>
    {!data.records.length ? <EmptyState icon={Palmtree} title="No leave requests" description={staff ? "Requests matching these filters will appear here." : "Requests you submit and their review status will appear here."} /> :
    <TableContainer label="Leave requests"><table className="data-table min-w-[820px]"><thead><tr>{staff && <th>Employee</th>}<th>Leave</th><th>Dates</th><th>Status</th><th>Submitted</th><th className="text-right">Actions</th></tr></thead><tbody>{data.records.map(r => {
      const from = localDate(r.startAt, tz), to = last(r.endAt);
      return <tr key={r.id}>{staff && <td><Cell2 primary={r.employee?.legalName ?? "—"} /></td>}
        <td><Cell2 primary={words(r.category)} secondary={`${r.type === "PAID" ? "Paid" : "Unpaid"} · ${r.reason}`} /></td>
        <td className="whitespace-nowrap tabular-nums">{rangeLabel(from, to)}</td>
        <td><StatusBadge status={r.status} />{r.reviewComment && <p className="mt-1 max-w-56 truncate text-xs text-muted-foreground" title={r.reviewComment}>“{r.reviewComment}”</p>}</td>
        <td className="whitespace-nowrap text-[13px] text-muted-foreground">{displayInstant(r.createdAt, tz)}</td>
        <td><div className="flex flex-wrap justify-end gap-1.5">
          {r.reviewHistory.length > 0 && <Dialog triggerSize="sm" variant="ghost" trigger="History" title="Review history" size="sm"><ol className="space-y-2 text-sm">{r.reviewHistory.map(d => <li key={d.id} className="rounded-lg border px-3 py-2"><span className="font-medium">{words(d.decision)}</span> · {d.reviewerName}<span className="block text-xs text-muted-foreground">{displayInstant(d.at, tz)}{d.comment ? ` · ${d.comment}` : ""}</span></li>)}</ol></Dialog>}
          {r.status === "PENDING" && (staff ? r.canDecide ? <Dialog triggerSize="sm" variant="default" trigger="Review" title="Review leave request" description={`${r.employee?.legalName ?? ""} · ${words(r.category)} · ${rangeLabel(from, to)} · requested ${r.type.toLowerCase()}`}><DecisionForm key={`${r.id}:${r.revision}`} kind="leaveDecision" id={r.id} revision={r.revision} /></Dialog> : <span className="text-xs text-muted-foreground">Needs an administrator</span>
            : <ActionForm compact action={reviewAction} submitVariant="outline" submitSize="sm" submitLabel="Withdraw" confirmation={{ title: "Withdraw leave request?", description: "The pending request is withdrawn and kept in your leave history.", label: "Withdraw request", destructive: true }}><Hidden values={{ kind: "leaveWithdraw", id: r.id }} /></ActionForm>)}
          {staff && r.canDecide && r.status === "APPROVED" && <Dialog triggerSize="sm" variant="ghost" triggerClassName="text-danger hover:bg-danger-soft hover:text-danger" trigger="Cancel" title="Cancel approved leave" description="Removes the leave coverage. Scheduled work on these dates becomes required again."><ActionForm action={reviewAction} submitLabel="Cancel leave" confirmation={{ title: "Cancel approved leave?", description: "This removes the approved leave coverage. The cancellation and reason are kept in review history.", label: "Cancel leave", destructive: true }}><Hidden values={{ kind: "leaveDecision", id: r.id, revision: r.revision, decision: "CANCELLED" }} /><Field label="Cancellation reason" name="comment" required maxLength={500} /></ActionForm></Dialog>}
        </div></td></tr>;
    })}</tbody></table></TableContainer>}
    <Card><CardHeader actions={staff && <Dialog trigger={<><CalendarPlus size={16} aria-hidden="true" />Add holiday</>} title="Add company holiday" description="A full organization-local day. It excuses the scheduled work it overlaps unless an assignment explicitly requires holiday work." size="sm"><ActionForm action={reviewAction} submitLabel="Save holiday"><Hidden values={{ kind: "holiday" }} /><Field label="Date" name="date" type="date" required /><Field label="Holiday name" name="name" required maxLength={100} /><Field label="Reason for the change" name="reason" required maxLength={500} /></ActionForm></Dialog>}>
      <CardTitle>Company holidays</CardTitle><CardDescription>Rest days come from each employee’s schedule.</CardDescription></CardHeader>
      <CardContent>{data.holidays.length ? <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.holidays.map(h => <li key={h.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"><span className="font-medium">{h.name}</span><span className="tabular-nums text-muted-foreground">{dateKey(h.localDate)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No holidays configured.</p>}</CardContent></Card>
  </>;
}
