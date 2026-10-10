import { Card,CardHeader,CardTitle,CardContent,CardDescription } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { reviewAction } from "@/features/review/actions";
import type { overtimeData } from "@/features/review/overtime";
import { displayInstant,durationLabel } from "@/features/time/dates";
import { Hidden,Quantity,DecisionForm } from "./forms";
export function WeeklyOvertime({data,own}:{data:Awaited<ReturnType<typeof overtimeData>>;own:boolean}) {
 const {current,row}=data;
 return <Card><CardHeader><CardTitle>{data.employee.legalName} · weekly overtime</CardTitle><CardDescription>{current.week} → {current.weekEnd} (exclusive) · {current.timezone} · policy {current.policyVersion}</CardDescription></CardHeader><CardContent className="space-y-5">
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Quantity label="Threshold" seconds={current.thresholdSeconds}/><Quantity label="Completed actual time" seconds={current.actualSeconds}/><Quantity label="Potential overtime" seconds={current.potentialSeconds}/><Quantity label="Active approved overtime" seconds={data.activeApprovedSeconds}/></div>
  <p className="text-sm">Review status: <strong>{row?.status??"Not calculated for review"}</strong>. Scheduled: {durationLabel(current.scheduledSeconds)}. Leave and unworked holidays do not count as actual work. Positive overtime requires manager review after the week ends.</p>
  {current.blockers.length>0 && <p role="status" className="text-sm text-amber-800">Resolve: {current.blockers.join("; ")}</p>}
  {row && <p className="text-sm">Last reviewed/calculated input: {durationLabel(row.actualSecondsSnapshot)} actual, {durationLabel(row.potentialSecondsSnapshot)} potential. Retained approval: {durationLabel(row.approvedSeconds)}{row.status==="STALE"?" (inactive until reviewed again)":""}. {row.reviewComment}</p>}
  {!own && current.ended && <ActionForm action={reviewAction} submitLabel="Calculate / refresh weekly review"><Hidden values={{kind:"calculate",employeeId:data.employee.id,week:current.week}}/></ActionForm>}
  {!own && row?.status==="PENDING" && data.canDecide && <DecisionForm kind="overtimeDecision" id={row.id} revision={row.revision} amount={current.potentialSeconds} max={current.potentialSeconds}/>}
  {!own && !data.canDecide && <p className="text-sm">An administrator must decide your own overtime.</p>}
  <p className="text-sm text-muted-foreground">Partial approval uses the last approved seconds of the chronological overtime candidate intervals. Salary calculations use this approved allocation and effective compensation terms.</p>
  {data.allocation.length>0 && <div className="space-y-2 text-sm"><strong>Active approved allocation</strong>{data.allocation.map(v=><p key={v.start}>{displayInstant(new Date(v.start*1000),current.timezone)} – {displayInstant(new Date(v.end*1000),current.timezone)} · {durationLabel(v.end-v.start)}</p>)}</div>}
 </CardContent></Card>;
}
