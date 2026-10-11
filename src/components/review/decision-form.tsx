"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field,SelectField } from "@/components/ui/field";
import { reviewAction } from "@/features/review/actions";
export function DecisionForm({kind,id,revision,amount=0,max=0}:{kind:"correctionDecision"|"overtimeDecision"|"leaveDecision";id:string;revision?:number;amount?:number;max?:number}) {
 const [decision,setDecision]=useState("APPROVED"),overtime=kind==="overtimeDecision",rejected=decision==="REJECTED";
 const subject=overtime?"overtime":kind==="leaveDecision"?"leave request":"attendance correction";
 return <ActionForm action={reviewAction} submitLabel={`${rejected?"Reject":"Approve"} ${subject}`} confirmation={{title:`${rejected?"Reject":"Approve"} ${subject}?`,description:overtime?rejected?"This records zero payable overtime and notifies the employee. Original attendance stays intact. Only changed evidence can reopen review.":"The approved time will be eligible for salary calculations. Confirm that the amount and attendance evidence are correct.":"This records your decision and notifies the employee. Check the request and supporting evidence before confirming.",label:rejected?"Confirm rejection":"Confirm approval",destructive:rejected}}>
  <input type="hidden" name="kind" value={kind}/><input type="hidden" name="id" value={id}/>{revision&&<input type="hidden" name="revision" value={revision}/>}
  <SelectField label="Decision" name="decision" value={decision} onChange={e=>setDecision(e.target.value)}><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option></SelectField>
  {overtime && (rejected?<div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-900">Rejected overtime approves zero hours. Attendance records will be retained.{["approvedHours","approvedMinutes","approvedRemainder"].map(name=><input key={name} type="hidden" name={name} value="0"/>)}</div>:<div className="grid gap-3 sm:grid-cols-3"><Field label="Approved hours" name="approvedHours" type="number" min={0} max={Math.ceil(max/3600)} step={1} required defaultValue={Math.floor(amount/3600)}/><Field label="Approved minutes" name="approvedMinutes" type="number" min={0} max={59} step={1} required defaultValue={Math.floor(amount%3600/60)}/><Field label="Approved seconds" name="approvedRemainder" type="number" min={0} max={59} step={1} required defaultValue={amount%60}/></div>)}
  <Field label={kind==="correctionDecision"||overtime&&!rejected?"Review reason":"Review reason (optional)"} name="comment" required={kind==="correctionDecision"||overtime&&!rejected} maxLength={500}/>
 </ActionForm>;
}
