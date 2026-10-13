import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { Metric } from "@/components/ui/stat";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { reviewAction } from "@/features/review/actions";
import type { overtimeData } from "@/features/review/overtime";
import { addDays, displayInstant } from "@/features/time/dates";
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
      {row?.status === "REJECTED" && <Alert tone="danger" title="Overtime rejected">No overtime pay is included for this week. Original attendance records remain intact.{row.reviewComment ? ` Reason: ${row.reviewComment}` : ""}</Alert>}
      {row && row.status !== "REJECTED" && <div className="rounded-lg border bg-subtle px-4 py-3 text-sm leading-6"><p>Last calculation: {hm(row.actualSecondsSnapshot)} actual · {hm(row.potentialSecondsSnapshot)} potential{row.status === "APPROVED" || row.status === "STALE" ? ` · approved ${hm(row.approvedSeconds)}${row.status === "STALE" ? " (inactive until reviewed again)" : ""}` : ""}.</p>{row.reviewedAt && <p className="text-muted-foreground">Reviewed {displayInstant(row.reviewedAt, current.timezone)}{row.reviewComment ? ` — “${row.reviewComment}”` : ""}</p>}</div>}
      {!own && (current.ended || (row?.status === "PENDING" && data.canDecide)) && <div className="flex flex-wrap items-center gap-2">
        {current.ended && <ActionForm compact action={reviewAction} submitVariant="outline" submitLabel={row ? "Recalculate week" : "Calculate overtime"}><Hidden values={{ kind: "calculate", employeeId: data.employee.id, week: current.week }} /></ActionForm>}
        {row?.status === "PENDING" && data.canDecide && <Dialog variant="default" trigger="Review overtime" title="Overtime decision" description={`${data.employee.legalName} · ${hm(current.potentialSeconds)} potential overtime. Partial approval keeps the latest chronological portion.`}><DecisionForm key={`${row.id}:${row.revision}`} kind="overtimeDecision" id={row.id} revision={row.revision} amount={current.potentialSeconds} max={current.potentialSeconds} /></Dialog>}
      </div>}
      {!own && data.decisionBlockReason && <Alert tone="neutral">{data.decisionBlockReason}</Alert>}
      {data.allocation.length > 0 && <div className="text-sm"><p className="font-medium">Approved allocation</p><ul className="mt-1.5 space-y-1 text-muted-foreground">{data.allocation.map(v => <li key={v.start} className="tabular-nums">{displayInstant(new Date(v.start * 1000), current.timezone)} – {displayInstant(new Date(v.end * 1000), current.timezone)} · {hm(v.end - v.start)}</li>)}</ul></div>}
    </CardContent></Card>;
}
