"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, TextAreaField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils/cn";
import { reviewAction } from "@/features/review/actions";
export function DecisionForm({ kind, id, revision, amount = 0, max = 0 }: { kind: "correctionDecision" | "overtimeDecision" | "leaveDecision"; id: string; revision?: number; amount?: number; max?: number }) {
  const [decision, setDecision] = useState("APPROVED"), overtime = kind === "overtimeDecision", rejected = decision === "REJECTED";
  const subject = overtime ? "overtime" : kind === "leaveDecision" ? "leave request" : "attendance correction";
  return <ActionForm action={reviewAction} submitLabel={`${rejected ? "Reject" : "Approve"} ${subject}`} confirmation={{ title: `${rejected ? "Reject" : "Approve"} ${subject}?`, description: overtime ? rejected ? "This records zero payable overtime and notifies the employee. The original attendance stays intact; only changed attendance evidence can reopen the review." : "The approved time becomes eligible for earnings calculations. Confirm the amount and attendance evidence." : "This records your decision and notifies the employee. Check the request and supporting evidence first.", label: rejected ? "Confirm rejection" : "Confirm approval", destructive: rejected }}>
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />{revision && <input type="hidden" name="revision" value={revision} />}
    <fieldset><legend className="mb-1.5 text-sm font-medium">Decision</legend><div className="grid grid-cols-2 gap-2">{[["APPROVED", "Approve"], ["REJECTED", "Reject"]].map(([value, label]) => <label key={value} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium", decision === value && (value === "REJECTED" ? "border-danger bg-danger-soft text-danger" : "border-primary bg-primary-soft text-primary"))}><input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} />{label}</label>)}</div></fieldset>
    {overtime && (rejected ? <Alert tone="danger">Rejecting approves zero hours of payable overtime. Attendance records are kept unchanged.{["approvedHours", "approvedMinutes", "approvedRemainder"].map(name => <input key={name} type="hidden" name={name} value="0" />)}</Alert>
      : <div><p className="mb-1.5 text-sm font-medium">Approved overtime <span className="font-normal text-muted-foreground">(up to the potential amount)</span></p><div className="grid grid-cols-3 gap-3"><Field label="Hours" name="approvedHours" type="number" min={0} max={Math.ceil(max / 3600)} step={1} required defaultValue={Math.floor(amount / 3600)} /><Field label="Minutes" name="approvedMinutes" type="number" min={0} max={59} step={1} required defaultValue={Math.floor(amount % 3600 / 60)} /><Field label="Seconds" name="approvedRemainder" type="number" min={0} max={59} step={1} required defaultValue={amount % 60} /></div></div>)}
    <TextAreaField rows={3} label={kind === "correctionDecision" || overtime && !rejected ? "Review reason" : "Review reason (optional)"} name="comment" required={kind === "correctionDecision" || overtime && !rejected} maxLength={500} />
  </ActionForm>;
}
