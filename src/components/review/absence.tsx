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
import { configAction } from "@/features/settings/config-actions";
import type { absenceData } from "@/features/review/absence";
import { dateKey, displayInstant, localDate } from "@/features/time/dates";
import { rangeLabel } from "@/lib/utils/date-range";
import { Hidden, DecisionForm } from "./forms";
type Data = Awaited<ReturnType<typeof absenceData>>;
type LeaveBalance = { category: string; label: string; paid: boolean; entitlement: number | null; override: boolean; used: number; pending: number; remaining: number | null; available: number | null };
const words = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase());
export type LeaveType = { code: string; label: string; isActive: boolean; paid: boolean; yearlyDays: number | null };
export const typeLabels = (types: LeaveType[]) => Object.fromEntries(types.map(t => [t.code, t.label])) as Record<string, string>;
export function RequestLeaveButton({ timezone, types, balances = [] }: { timezone: string; types: LeaveType[]; balances?: LeaveBalance[] }) {
  return <Dialog variant="default" trigger={<><Plus size={16} aria-hidden="true" />Request leave</>} title="Request leave" description={`Whole dates in ${timezone}, including the last day. Approved leave excuses scheduled work; it adds no worked hours or overtime.`}>
    <ActionForm action={reviewAction} submitLabel="Submit leave request"><Hidden values={{ kind: "datedLeave", operationKey: randomUUID() }} />
      <FieldGrid><Field label="First day" name="startDate" type="date" required /><Field label="Last day (inclusive)" name="endDate" type="date" required /></FieldGrid>
      <FieldGrid><SelectField label="Leave type" name="category" required>{types.filter(t => t.isActive).map(t => { const b = balances.find(x => x.category === t.code); return <option key={t.code} value={t.code}>{t.label}{b?.available != null ? ` · ${Math.max(0, b.available)} days available` : ""}</option>; })}</SelectField><SelectField label="Pay treatment" name="type" defaultValue="" hint="Unpaid leave types are always unpaid."><option value="">Leave type default</option><option value="PAID">Paid</option><option value="UNPAID">Unpaid</option></SelectField></FieldGrid>
      <TextAreaField label="Reason" name="reason" required maxLength={500} rows={3} />
    </ActionForm></Dialog>;
}
export function Absence({ data, staff, labels = {} }: { data: Data; staff: boolean; labels?: Record<string, string> }) {
  const name = (code: string) => labels[code] ?? words(code);
  const tz = data.timezone, last = (end: Date) => localDate(new Date(end.getTime() - 1000), tz);
  return <>
    {!data.records.length ? <EmptyState icon={Palmtree} title="No leave requests" description={staff ? "Requests matching these filters will appear here." : "Requests you submit and their review status will appear here."} /> :
    <TableContainer label="Leave requests"><table className="data-table min-w-[820px]"><thead><tr>{staff && <th>Employee</th>}<th>Leave</th><th>Dates</th><th>Status</th><th>Submitted</th><th className="text-right">Actions</th></tr></thead><tbody>{data.records.map(r => {
      const from = localDate(r.startAt, tz), to = last(r.endAt);
      return <tr key={r.id}>{staff && <td><Cell2 primary={r.employee?.legalName ?? "—"} /></td>}
        <td><Cell2 primary={name(r.category)} secondary={`${r.type === "PAID" ? "Paid" : "Unpaid"} · ${r.reason}`} />{r.overBalance.length > 0 && <p className="mt-1 text-xs font-medium text-warning">Over balance: {r.overBalance.join(" · ")}</p>}</td>
        <td className="whitespace-nowrap tabular-nums">{rangeLabel(from, to)}</td>
        <td><StatusBadge status={r.status} />{r.reviewComment && <p className="mt-1 max-w-56 truncate text-xs text-muted-foreground" title={r.reviewComment}>“{r.reviewComment}”</p>}</td>
        <td className="whitespace-nowrap text-[13px] text-muted-foreground">{displayInstant(r.createdAt, tz)}</td>
        <td><div className="flex flex-wrap justify-end gap-1.5">
          {r.reviewHistory.length > 0 && <Dialog triggerSize="sm" variant="ghost" trigger="History" title="Review history" size="sm"><ol className="space-y-2 text-sm">{r.reviewHistory.map(d => <li key={d.id} className="rounded-lg border px-3 py-2"><span className="font-medium">{words(d.decision)}</span> · {d.reviewerName}<span className="block text-xs text-muted-foreground">{displayInstant(d.at, tz)}{d.comment ? ` · ${d.comment}` : ""}</span></li>)}</ol></Dialog>}
          {r.status === "PENDING" && (staff ? r.canDecide ? <Dialog triggerSize="sm" variant="default" trigger="Review" title="Review leave request" description={`${r.employee?.legalName ?? ""} · ${name(r.category)} · ${rangeLabel(from, to)} · requested ${r.type.toLowerCase()}`}><DecisionForm key={`${r.id}:${r.revision}`} kind="leaveDecision" id={r.id} revision={r.revision} /></Dialog> : <span className="text-xs text-muted-foreground">Needs an administrator</span>
            : <ActionForm compact action={reviewAction} submitVariant="outline" submitSize="sm" submitLabel="Withdraw" confirmation={{ title: "Withdraw leave request?", description: "The pending request is withdrawn and kept in your leave history.", label: "Withdraw request", destructive: true }}><Hidden values={{ kind: "leaveWithdraw", id: r.id }} /></ActionForm>)}
          {staff && r.canDecide && r.status === "APPROVED" && <Dialog triggerSize="sm" variant="ghost" triggerClassName="text-danger hover:bg-danger-soft hover:text-danger" trigger="Cancel" title="Cancel approved leave" description="Removes the leave coverage. Scheduled work on these dates becomes required again."><ActionForm action={reviewAction} submitLabel="Cancel leave" confirmation={{ title: "Cancel approved leave?", description: "This removes the approved leave coverage. The cancellation and reason are kept in review history.", label: "Cancel leave", destructive: true }}><Hidden values={{ kind: "leaveDecision", id: r.id, revision: r.revision, decision: "CANCELLED" }} /><Field label="Cancellation reason" name="comment" required maxLength={500} /></ActionForm></Dialog>}
        </div></td></tr>;
    })}</tbody></table></TableContainer>}
    <Card><CardHeader actions={staff && <Dialog trigger={<><CalendarPlus size={16} aria-hidden="true" />Add holiday</>} title="Add company holiday" description="A full organization-local day. It excuses the scheduled work it overlaps unless an assignment explicitly requires holiday work." size="sm"><ActionForm action={reviewAction} submitLabel="Save holiday"><Hidden values={{ kind: "holiday" }} /><Field label="Date" name="date" type="date" required /><Field label="Holiday name" name="name" required maxLength={100} /><Field label="Reason for the change" name="reason" required maxLength={500} /></ActionForm></Dialog>}>
      <CardTitle>Company holidays</CardTitle><CardDescription>Rest days come from each employee’s schedule.</CardDescription></CardHeader>
      <CardContent>{data.holidays.length ? <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.holidays.map(h => <li key={h.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"><span className="font-medium">{h.name}</span><span className="tabular-nums text-muted-foreground">{dateKey(h.localDate)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No holidays configured.</p>}</CardContent></Card>
  </>;
}
/** Yearly leave balances per type. Staff can set a per-employee allowance that overrides the type default. */
export function LeaveBalances({ data, staff = false, types = [] }: { data: { year: number; employeeId: string; basis: string; rule: string; balances: LeaveBalance[] }; staff?: boolean; types?: LeaveType[] }) {
  const limited = data.balances.filter(b => b.entitlement !== null || staff);
  return <Card><CardHeader actions={staff && <Dialog trigger="Set allowance" title="Set a yearly leave allowance" description="Overrides the leave type’s default for this employee and year." size="sm"><ActionForm action={configAction} submitLabel="Save allowance"><Hidden values={{ kind: "allowance", employeeId: data.employeeId }} /><FieldGrid><SelectField label="Leave type" name="category" required>{types.filter(t => t.isActive).map(t => <option key={t.code} value={t.code}>{t.label}</option>)}</SelectField><Field label="Year" name="year" type="number" min={1900} max={2199} required defaultValue={data.year} /></FieldGrid><Field label="Allowance (days)" name="days" type="number" min={0} max={366} step={0.5} required /><Field label="Reason" name="reason" required maxLength={500} /></ActionForm></Dialog>}>
    <CardTitle>Leave balance · {data.year}</CardTitle><CardDescription>Counted in {data.basis === "WORKING" ? "working days (off days and holidays excluded)" : "calendar days"}. Half days count as 0.5. {data.rule === "BLOCK" ? "Requests over the balance are blocked." : "Requests over the balance are flagged for HR."}</CardDescription></CardHeader>
    <CardContent>{!limited.length ? <p className="text-sm text-muted-foreground">No leave type has a yearly limit.</p> :
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{limited.map(b => <div key={b.category} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold">{b.label}</p>{b.override && <span className="rounded-full bg-primary-soft px-2 text-[11px] font-medium text-primary">Custom</span>}</div>
        {b.entitlement === null ? <p className="mt-2 text-sm text-muted-foreground">No yearly limit · {b.used} used{b.pending ? ` · ${b.pending} pending` : ""}</p> : <>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{Math.max(0, b.available ?? 0)}<span className="ml-1 text-sm font-normal text-muted-foreground">of {b.entitlement} days available</span></p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (b.used + b.pending) / Math.max(b.entitlement, 0.5) * 100)}%` }} /></div>
          <p className="mt-2 text-xs text-muted-foreground">{b.used} used · {b.pending} pending{(b.available ?? 0) < 0 ? ` · ${-(b.available ?? 0)} over` : ""}</p></>}
      </div>)}</div>}
    </CardContent></Card>;
}
