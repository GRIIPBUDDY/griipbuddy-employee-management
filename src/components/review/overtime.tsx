import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { Metric } from "@/components/ui/stat";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { reviewAction } from "@/features/review/actions";
import type { overtimeData } from "@/features/review/overtime";
import { addDays, displayInstant, displayTime } from "@/features/time/dates";
import { TableContainer } from "@/components/ui/table";
import { rangeLabel } from "@/lib/utils/date-range";
import { hm } from "@/components/time/attendance";
import { Hidden, DecisionForm } from "./forms";
export function WeeklyOvertime({ data, own }: { data: Awaited<ReturnType<typeof overtimeData>>; own: boolean }) {
  const { current, row } = data, status = row?.status ?? (current.ended ? "UNREVIEWED" : "IN_PROGRESS");
  return <Card><CardHeader actions={<StatusBadge status={status} label={status === "IN_PROGRESS" ? "Week in progress" : undefined} />}>
    <CardTitle>{own ? "Week of " : `${data.employee.legalName} · week of `}{rangeLabel(current.week, addDays(current.weekEnd, -1))}</CardTitle><CardDescription>{current.timezone} · overtime policy version {current.policyVersion}. Potential overtime needs an explicit decision before it is payable.</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Scheduled" value={hm(current.scheduledSeconds)} /><Metric label="Completed actual" value={hm(current.actualSeconds)} /><Metric label="Weekly threshold" value={hm(current.thresholdSeconds)} /><Metric label="Potential overtime" value={hm(current.potentialSeconds)} hint="Not payable until approved" /><Metric label="Approved (payable)" value={hm(data.activeApprovedSeconds)} className={data.activeApprovedSeconds ? "border-[#abefc6] bg-success-soft" : undefined} /></div>
      {current.blockers.length > 0 && <Alert tone="warning" role="status" title="Resolve before review">{current.blockers.join(" · ")}</Alert>}
      {data.open && !own && row && <Alert tone="info" role="status" title="Week in progress">A decision covers the attendance recorded so far. If more attendance is recorded this week, the review reopens and the earlier decision stays in the history.</Alert>}
      {!own && <AttendanceEvidence sessions={data.sessions} timezone={current.timezone} />}
      {row?.status === "REJECTED" && <Alert tone="danger" title="Overtime rejected">No overtime pay is included for this week. Original attendance records remain intact.{row.reviewComment ? ` Reason: ${row.reviewComment}` : ""}</Alert>}
      {row && row.status !== "REJECTED" && <div className="rounded-lg border bg-subtle px-4 py-3 text-sm leading-6"><p>Last calculation: {hm(row.actualSecondsSnapshot)} actual · {hm(row.potentialSecondsSnapshot)} potential{row.status === "APPROVED" || row.status === "STALE" ? ` · approved ${hm(row.approvedSeconds)}${row.status === "STALE" ? " (inactive until reviewed again)" : ""}` : ""}.</p>{row.reviewedAt && <p className="text-muted-foreground">Reviewed {displayInstant(row.reviewedAt, current.timezone)}{row.reviewComment ? ` — “${row.reviewComment}”` : ""}</p>}</div>}
      {!own && (current.ended || row || current.potentialSeconds > 0) && <div className="flex flex-wrap items-center gap-2">
        <ActionForm compact action={reviewAction} submitVariant="outline" submitLabel={row ? "Recalculate week" : "Calculate overtime"}><Hidden values={{ kind: "calculate", employeeId: data.employee.id, week: current.week }} /></ActionForm>
        {row?.status === "PENDING" && data.canDecide && <Dialog variant="default" trigger="Review overtime" title="Overtime decision" description={`${data.employee.legalName} · ${hm(current.potentialSeconds)} potential overtime of ${hm(current.actualSeconds)} worked (${hm(current.scheduledSeconds)} scheduled). Partial approval keeps the latest chronological portion.`}><AttendanceEvidence sessions={data.sessions} timezone={current.timezone} compact /><DecisionForm key={`${row.id}:${row.revision}`} kind="overtimeDecision" id={row.id} revision={row.revision} amount={current.potentialSeconds} max={current.potentialSeconds} /></Dialog>}
      </div>}
      {!own && data.decisionBlockReason && <Alert tone="neutral">{data.decisionBlockReason}</Alert>}
      {data.allocation.length > 0 && <div className="text-sm"><p className="font-medium">Approved allocation</p><ul className="mt-1.5 space-y-1 text-muted-foreground">{data.allocation.map(v => <li key={v.start} className="tabular-nums">{displayInstant(new Date(v.start * 1000), current.timezone)} – {displayInstant(new Date(v.end * 1000), current.timezone)} · {hm(v.end - v.start)}</li>)}</ul></div>}
    </CardContent></Card>;
}
type Session = Awaited<ReturnType<typeof overtimeData>>["sessions"][number];
/** Attendance behind the calculation: schedule, actual check-in/checkout and time outside the assigned schedule. */
function AttendanceEvidence({ sessions, timezone, compact = false }: { sessions: Session[]; timezone: string; compact?: boolean }) {
  if (!sessions.length) return compact ? null : <p className="text-sm text-muted-foreground">No attendance recorded in this week.</p>;
  const schedule = (x: Session) => x.scheduled && x.scheduledStartAt && x.scheduledEndAt ? `${displayTime(x.scheduledStartAt, timezone)}–${displayTime(x.scheduledEndAt, timezone)}` : "Unscheduled";
  if (compact) return <ul className="mb-4 space-y-1 rounded-lg border bg-subtle px-3 py-2 text-[13px]">{sessions.map(x => <li key={x.id} className="flex flex-wrap justify-between gap-x-3 tabular-nums"><span>{x.workDate} · {schedule(x)}</span><span>{displayTime(x.checkinAt, timezone)}–{x.checkoutAt ? displayTime(x.checkoutAt, timezone) : "open"} · {hm(x.workedSeconds)}{x.outsideScheduleSeconds ? ` · ${hm(x.outsideScheduleSeconds)} outside schedule` : ""}</span></li>)}</ul>;
  return <TableContainer label="Attendance this week" flush className="rounded-lg border"><table className="data-table min-w-[680px]"><thead><tr><th>Date</th><th>Schedule</th><th>Check-in</th><th>Checkout</th><th className="num">Worked</th><th className="num">Outside schedule</th></tr></thead><tbody>{sessions.map(x => <tr key={x.id}>
    <td className="tabular-nums">{x.workDate}</td><td>{x.scheduled ? schedule(x) : <StatusBadge status="UNSCHEDULED" tone="warning" label="Unscheduled" />}</td>
    <td className="tabular-nums">{displayInstant(x.checkinAt, timezone)}</td><td className="tabular-nums">{x.checkoutAt ? displayInstant(x.checkoutAt, timezone) : <span className="text-warning">Missing</span>}</td>
    <td className="num">{hm(x.workedSeconds)}</td><td className="num">{x.outsideScheduleSeconds ? hm(x.outsideScheduleSeconds) : "—"}</td></tr>)}</tbody></table></TableContainer>;
}
