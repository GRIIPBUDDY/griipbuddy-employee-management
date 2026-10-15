import Link from "next/link";
import { Clock3, Plus, TimerOff } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextAreaField, FieldGrid, CheckboxField } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Metric } from "@/components/ui/stat";
import { Hidden } from "@/components/review/forms";
import { hm } from "@/components/time/attendance";
import { missingTimeAction } from "@/features/work-time/actions";
import { missingTimeCategories, missingTimeStatuses } from "@/features/work-time/options";
import { dateKey } from "@/features/time/dates";
type Tone = "success" | "warning" | "danger" | "info" | "neutral";
const statusTone: Record<string, Tone> = { PENDING: "warning", CONFIRMED: "danger", REJECTED: "neutral" };
const clock = (d: Date, zone: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(d);
export const minutesLabel = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m} min`;
export function MissingTimeStatus({ status }: { status: string }) { return <StatusBadge status={status} label={missingTimeStatuses[status as keyof typeof missingTimeStatuses] ?? status} tone={statusTone[status] ?? "neutral"} />; }
/** Staff form for time an employee was away while still checked in (shortfalls from check-in/out need no record). */
export function RecordMissingTime({ employees, today, timezone }: { employees: { id: string; legalName: string; employeeNumber: string }[]; today: string; timezone: string }) {
  return <Dialog variant="default" size="lg" trigger={<><Plus size={16} aria-hidden="true" />Record missing time</>} title="Record missing time"
    description="For time an employee was away while still checked in. Late arrival and early checkout are already calculated from attendance and need no record. The record changes nothing until it is confirmed.">
    <ActionForm action={missingTimeAction} submitLabel="Save for review"><Hidden values={{ kind: "create" }} />
      <SelectField label="Employee" name="employeeId" required defaultValue=""><option value="">Choose employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.legalName} · {e.employeeNumber}</option>)}</SelectField>
      <FieldGrid columns={3}><Field label="Date" name="date" type="date" required max={today} defaultValue={today} /><Field label="From" name="start" type="time" required hint={timezone} /><Field label="Until" name="end" type="time" required /></FieldGrid>
      <CheckboxField name="endsNextDay" label="Ends after midnight (next day)" />
      <SelectField label="Category" name="category" required defaultValue="AWAY_FROM_WORK">{Object.entries(missingTimeCategories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
      <TextAreaField label="What was observed" name="reason" required rows={3} maxLength={1000} hint="Factual: what, where and who observed it. The employee can read this and respond." />
      <TextAreaField label="Supporting note (optional)" name="evidenceNote" rows={2} maxLength={2000} />
    </ActionForm></Dialog>;
}
type RecordRow = { id: string; employeeId: string; employee?: { legalName: string; employeeNumber: string }; workDate: Date; startAt: Date; endAt: Date; category: string; reason: string; evidenceNote: string; status: string; decisionNote: string | null; employeeResponse: string | null; revision: number; minutes: number; effectiveMinutes: number };
export function MissingTimeTable({ records, timezone, staff }: { records: RecordRow[]; timezone: string; staff: boolean }) {
  if (!records.length) return <EmptyState icon={TimerOff} title="No missing-time records" description={staff ? "Change the filters, or record time an employee was away while checked in." : "Nothing has been recorded about your time."} />;
  return <TableContainer label="Missing-time records"><table className="data-table min-w-[960px]"><thead><tr>{staff && <th>Employee</th>}<th>When</th><th className="num">Unpaid if confirmed</th><th>Reported</th><th>Status</th><th>Employee response</th>{staff && <th className="text-right">Action</th>}</tr></thead><tbody>{records.map(r => <tr key={r.id}>
    {staff && <td><Cell2 primary={r.employee?.legalName ?? "—"} secondary={r.employee?.employeeNumber} /></td>}
    <td className="whitespace-nowrap tabular-nums"><Cell2 primary={dateKey(r.workDate)} secondary={`${clock(r.startAt, timezone)}–${clock(r.endAt, timezone)}`} /></td>
    <td className="num"><span className="font-medium">{minutesLabel(r.effectiveMinutes)}</span>{r.effectiveMinutes !== r.minutes && <span className="block text-xs text-muted-foreground">of {minutesLabel(r.minutes)} reported</span>}</td>
    <td className="max-w-sm"><Cell2 primary={missingTimeCategories[r.category as keyof typeof missingTimeCategories] ?? r.category} secondary={r.reason} />{r.decisionNote && <p className="mt-1 text-xs text-muted-foreground">Decision: {r.decisionNote}</p>}</td>
    <td><MissingTimeStatus status={r.status} /></td>
    <td className="max-w-xs text-[13px]">{r.employeeResponse ?? <span className="text-muted-foreground">—</span>}</td>
    {staff && <td className="text-right">{r.status === "PENDING" ? <Dialog triggerSize="sm" variant="default" trigger="Review" triggerLabel={`Review missing time for ${r.employee?.legalName}`} title="Review missing time" description="Confirmed time is removed from verified work exactly once and becomes unpaid. A rejected report has no effect on pay.">
      <ActionForm action={missingTimeAction} submitLabel="Save decision" confirmation={{ title: "Save this decision?", description: "Confirmed time reduces payable time in unfinished salary months and may require overtime to be reviewed again.", label: "Save decision" }}><Hidden values={{ kind: "review", id: r.id, revision: r.revision }} />
        <SelectField label="Decision" name="decision" required defaultValue=""><option value="">Choose</option><option value="CONFIRMED">Confirm: unpaid</option><option value="REJECTED">Reject: no effect</option></SelectField>
        <TextAreaField label="Decision note" name="note" required rows={2} maxLength={1000} />
      </ActionForm></Dialog>
      : <Dialog triggerSize="sm" variant="ghost" trigger="Reopen" triggerLabel={`Reopen missing time for ${r.employee?.legalName}`} title="Reopen for review" description="Returns the record to Pending. Confirmed time stops counting until it is decided again; the earlier decision stays in the audit log.">
        <ActionForm action={missingTimeAction} submitLabel="Reopen"><Hidden values={{ kind: "reopen", id: r.id, revision: r.revision }} /><TextAreaField label="Reason" name="reason" required rows={2} maxLength={1000} /></ActionForm></Dialog>}</td>}
  </tr>)}</tbody></table></TableContainer>;
}
type Totals = { requiredSeconds: number; paidLeaveSeconds: number; regularSeconds: number; missingSeconds: number; confirmedUnpaidSeconds: number; pendingSeconds: number; awayConfirmedSeconds: number; potentialOvertimeSeconds: number; approvedOvertimeSeconds: number };
export function WorkTimeTotals({ totals }: { totals: Totals }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
    <Metric label="Scheduled payable" value={hm(totals.requiredSeconds)} hint="After approved leave and holidays" />
    <Metric label="Verified work" value={hm(totals.regularSeconds)} hint="Inside scheduled periods" />
    <Metric label="Paid leave & holidays" value={hm(totals.paidLeaveSeconds)} hint="Credited, not worked" />
    <Metric label="Unpaid (confirmed)" value={<span className={totals.confirmedUnpaidSeconds ? "text-danger" : undefined}>{hm(totals.confirmedUnpaidSeconds)}</span>} hint={totals.awayConfirmedSeconds ? `incl. ${hm(totals.awayConfirmedSeconds)} recorded away` : "Missing from finished periods"} />
    <Metric label="Pending review" value={<span className={totals.pendingSeconds ? "text-warning" : undefined}>{hm(totals.pendingSeconds)}</span>} hint="Not deducted until resolved" />
    <Metric label="Overtime" value={hm(totals.approvedOvertimeSeconds)} hint={`approved of ${hm(totals.potentialOvertimeSeconds)} potential`} />
  </div>;
}
type DayRow = { date: string; requiredSeconds: number; paidLeaveSeconds: number; regularSeconds: number; actualSeconds: number; missingSeconds: number; confirmedUnpaidSeconds: number; pendingSeconds: number; awayConfirmedSeconds: number; lateSeconds: number; earlySeconds: number; absenceCount: number; pendingCorrections: number; incompleteCount: number; pendingAway: number; pending: boolean };
function Reasons({ d }: { d: DayRow }) {
  const items: [string, string, Tone][] = [
    ...(d.absenceCount ? [["ABSENT", `${d.absenceCount} period${d.absenceCount === 1 ? "" : "s"} absent`, "danger"] as [string, string, Tone]] : []),
    ...(d.lateSeconds ? [["LATE", `Late ${hm(d.lateSeconds)}`, "warning"] as [string, string, Tone]] : []), ...(d.earlySeconds ? [["EARLY", `Left early ${hm(d.earlySeconds)}`, "warning"] as [string, string, Tone]] : []),
    ...(d.awayConfirmedSeconds ? [["CONFIRMED", `Away ${hm(d.awayConfirmedSeconds)} (confirmed)`, "danger"] as [string, string, Tone]] : []), ...(d.pendingAway ? [["PENDING", "Away time awaiting review", "warning"] as [string, string, Tone]] : []),
    ...(d.incompleteCount ? [["INCOMPLETE", "Missing checkout", "warning"] as [string, string, Tone]] : []), ...(d.pendingCorrections ? [["PENDING", "Correction pending", "info"] as [string, string, Tone]] : []),
    ...(d.paidLeaveSeconds ? [["PAID", "Paid leave / holiday", "success"] as [string, string, Tone]] : []),
  ];
  return items.length ? <div className="flex flex-wrap gap-1">{items.map(([s, l, t]) => <StatusBadge key={l} status={s} label={l} tone={t} />)}</div> : <span className="text-xs text-muted-foreground">—</span>;
}
export function WorkTimeDays({ days, employeeId, staff }: { days: DayRow[]; employeeId?: string; staff: boolean }) {
  if (!days.length) return <p className="text-sm text-muted-foreground">No days match these filters.</p>;
  return <TableContainer label="Work time by day" flush className="rounded-lg border"><table className="data-table min-w-[900px]"><thead><tr><th>Date</th><th className="num">Scheduled</th><th className="num">Verified work</th><th className="num">Missing</th><th className="num">Confirmed unpaid</th><th className="num">Pending review</th><th>Reason / status</th></tr></thead><tbody>{days.map(d => <tr key={d.date}>
    <td className="whitespace-nowrap tabular-nums">{staff && employeeId ? <Link className="link" href={`/manage/employees/${employeeId}/attendance/day?date=${d.date}`}>{d.date}</Link> : d.date}</td>
    <td className="num">{hm(d.requiredSeconds)}</td><td className="num">{hm(d.regularSeconds)}</td>
    <td className="num">{d.missingSeconds ? hm(d.missingSeconds) : "—"}</td>
    <td className="num font-medium">{d.confirmedUnpaidSeconds ? <span className="text-danger">{hm(d.confirmedUnpaidSeconds)}</span> : "—"}</td>
    <td className="num">{d.pendingSeconds ? <span className="text-warning">{hm(d.pendingSeconds)}</span> : "—"}</td>
    <td><Reasons d={d} /></td>
  </tr>)}</tbody></table></TableContainer>;
}
/** The employee's single response to a record about them (explanation or dispute). */
export function RespondToMissingTime({ id, revision }: { id: string; revision: number }) {
  return <Dialog triggerSize="sm" trigger="Respond" title="Respond to this record" description="Explain or dispute what was recorded. Your response is kept exactly as written and staff are notified. To correct check-in or checkout times, use Corrections.">
    <ActionForm action={missingTimeAction} submitLabel="Submit response" confirmation={{ title: "Submit your response?", description: "You can respond once; the response cannot be changed afterwards.", label: "Submit response" }}><Hidden values={{ kind: "respond", id, revision }} />
      <TextAreaField label="Your response" name="response" required rows={4} maxLength={2000} />
    </ActionForm></Dialog>;
}
export function WorkTimeEmpty() { return <EmptyState icon={Clock3} title="No work time to show" description="Change the dates or filters." />; }
