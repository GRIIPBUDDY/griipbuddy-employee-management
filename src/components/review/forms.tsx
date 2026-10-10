import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { correctionOptions } from "@/features/review/corrections";
import { CorrectionFields } from "./correction-fields";
import { Temporal } from "@js-temporal/polyfill";
import { randomUUID } from "node:crypto";
import { ActionForm } from "@/components/ui/action-form";
import { Field,SelectField } from "@/components/ui/field";
import { Card,CardHeader,CardTitle,CardContent,CardDescription } from "@/components/ui/card";
import { reviewAction } from "@/features/review/actions";
import { displayInstant,dateKey,durationLabel,minuteLabel } from "@/features/time/dates";
import type { correctionList } from "@/features/review/corrections";
export function Hidden({values}:{values:Record<string,string|number>}){return <>{Object.entries(values).map(([k,v])=><input key={k} type="hidden" name={k} value={v}/>)}</>;}
export async function CorrectionForm({employeeId,sessionId="",workDate=""}:{timezone?:string;employeeId?:string;sessionId?:string;workDate?:string;scheduleSlotId?:string}) {
 const identity=await getIdentity(),options=await pageResult(correctionOptions(identity,employeeId,sessionId||undefined));
 const sessions=[...options.sessions];
 const selected=sessions.find(s=>s.id===sessionId),timezone=options.timezone;
 const local=(value:Date|null|undefined)=>value?Temporal.Instant.from(value.toISOString()).toZonedDateTimeISO(timezone).toPlainDateTime().toString():"";
 const weekdays=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
 return <Card><CardHeader><CardTitle>Request attendance correction</CardTitle><CardDescription>Times use {timezone}. Requests need review before they change official attendance. Leave timestamp fields empty for VOID.</CardDescription></CardHeader><CardContent><ActionForm action={reviewAction} submitLabel="Submit correction request">
  <Hidden values={{kind:"correction",operationKey:randomUUID(),...(employeeId?{employeeId}:{})}}/>
  <CorrectionFields initialSessionId={selected?.id??""} initialWorkDate={workDate} sessions={sessions.map(s=>({id:s.id,date:dateKey(s.workDate),label:`${dateKey(s.workDate)} · ${displayInstant(s.checkinAt,timezone)} → ${s.checkoutAt?displayInstant(s.checkoutAt,timezone):"Missing checkout"}`,checkin:local(s.checkinAt),checkout:local(s.checkoutAt),slotId:s.scheduleSlotId??""}))} periods={options.patterns.map(p=>({label:`${p.label??"Weekly pattern"} · ${dateKey(p.effectiveFrom)} → ${p.effectiveUntil?dateKey(p.effectiveUntil):"Ongoing"}`,slots:p.slots.map(s=>({id:s.id,label:`${weekdays[s.weekday-1]} · ${minuteLabel(s.startMinute)}–${minuteLabel(s.endMinute)}${s.endDayOffset?" (+1 day)":""}`}))}))}/>
  <Field name="reason" label="Explanation and supporting evidence" required maxLength={500}/>
 </ActionForm></CardContent></Card>;
}
export function DecisionForm({kind,id,revision,amount=0,max=0}:{kind:"correctionDecision"|"overtimeDecision"|"leaveDecision";id:string;revision?:number;amount?:number;max?:number}) {
 return <ActionForm action={reviewAction} submitLabel="Save review decision"><Hidden values={{kind,id,...(revision?{revision}:{})}}/>
  <SelectField label="Decision" name="decision"><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option></SelectField>
  {kind==="overtimeDecision" && <div className="grid gap-3 sm:grid-cols-3"><Field label="Approved overtime hours" name="approvedHours" type="number" min={0} max={Math.ceil(max/3600)} step={1} required defaultValue={Math.floor(amount/3600)}/><Field label="Approved overtime minutes" name="approvedMinutes" type="number" min={0} max={59} step={1} required defaultValue={Math.floor(amount%3600/60)}/><Field label="Approved overtime seconds" name="approvedRemainder" type="number" min={0} max={59} step={1} required defaultValue={amount%60}/><p className="text-xs text-muted-foreground sm:col-span-3">For rejection, enter zero for all three amounts.</p></div>}
  <Field label={kind==="leaveDecision"?"Review comment (optional)":"Review comment / reason"} name="comment" required={kind!=="leaveDecision"} maxLength={500}/>
 </ActionForm>;
}
export function CorrectionRequests({data,staff,timezone}:{data:Awaited<ReturnType<typeof correctionList>>;staff:boolean;timezone:string}) {
 return <>{data.records.map(r=><Card key={r.id}><CardHeader><CardTitle>{r.employee?.legalName??"Attendance correction"} · {r.type} · {r.status}</CardTitle><CardDescription>{dateKey(r.workDate)} · submitted {displayInstant(r.createdAt,timezone)}</CardDescription></CardHeader><CardContent className="space-y-4 text-sm">
  <p>{r.reason}</p>
  <OriginalTimes value={r.originalValues} timezone={timezone}/>
  <p>Requested actual check-in: {r.proposedCheckinAt?displayInstant(r.proposedCheckinAt,timezone):"—"}<br/>Requested checkout: {r.proposedCheckoutAt?displayInstant(r.proposedCheckoutAt,timezone):"—"}</p><p>Assigned period: {r.relatedSchedule ? `${r.relatedSchedule.workSchedule.label??"Weekly pattern"} · weekday ${r.relatedSchedule.weekday} · ${minuteLabel(r.relatedSchedule.startMinute)}–${minuteLabel(r.relatedSchedule.endMinute)}${r.relatedSchedule.endDayOffset?" (+1 day)":""}` : "Unscheduled factual work"}</p>
  {r.reviewComment && <p>Reviewer comment: {r.reviewComment}</p>}{r.reviewedAt && <p>Reviewed by {r.reviewerName??"Authorized reviewer"} · {displayInstant(r.reviewedAt,timezone)}</p>}
  {r.status==="PENDING" && (staff ? r.canDecide?<DecisionForm kind="correctionDecision" id={r.id}/>:<p>An administrator must review your own request.</p> : <ActionForm action={reviewAction} submitLabel="Withdraw pending request"><Hidden values={{kind:"correctionWithdraw",id:r.id}}/></ActionForm>)}
 </CardContent></Card>)}{!data.records.length && <p>No correction requests match this view.</p>}</>;
}
export function Quantity({label,seconds}:{label:string;seconds:number}){return <div className="rounded-lg border bg-white p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{durationLabel(seconds)}</p></div>;}

function OriginalTimes({value,timezone}:{value:unknown;timezone:string}) {
 const original=typeof value==="object" && value!==null?value as Record<string,unknown>:{};
 const show=(key:string)=>typeof original[key]==="string" && Number.isFinite(new Date(original[key] as string).getTime())?displayInstant(new Date(original[key] as string),timezone):"—";
 return <div className="rounded border bg-slate-50 p-3"><p className="font-medium">Original recorded context</p><p>Actual check-in: {show("checkinAt")} · checkout: {show("checkoutAt")}</p><p>Scheduled: {show("scheduledStartAt")} – {show("scheduledEndAt")}</p></div>;
}
