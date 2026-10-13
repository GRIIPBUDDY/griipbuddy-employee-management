"use client";
import { useState } from "react";
import { Field, SelectField, FieldGrid } from "@/components/ui/field";
export type SessionChoice = { id: string; date: string; label: string; checkin: string; checkout: string; slotId: string };
export type PeriodGroup = { label: string; slots: { id: string; label: string }[] };
export function CorrectionFields({ sessions, periods, initialSessionId, initialWorkDate, timezone }: { sessions: SessionChoice[]; periods: PeriodGroup[]; initialSessionId: string; initialWorkDate: string; timezone?: string }) {
  const [type, setType] = useState(initialSessionId ? "REPLACE" : "ADD"), [sessionId, setSessionId] = useState(initialSessionId);
  const selected = sessions.find(s => s.id === sessionId);
  return <>
    <fieldset className="grid gap-2"><legend className="mb-1.5 text-sm font-medium">What needs correcting?</legend><div className="grid gap-2 sm:grid-cols-3">{[["ADD", "Missing session", "I worked but no session was recorded"], ["REPLACE", "Wrong times", "Incorrect time or missing checkout"], ["VOID", "Remove session", "A session was recorded in error"]].map(([value, label, help]) => <label key={value} className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="type" value={value} checked={type === value} onChange={() => setType(value)} className="mt-0.5" /><span><span className="block font-medium">{label}</span><span className="text-xs text-muted-foreground">{help}</span></span></label>)}</div></fieldset>
    {type !== "ADD" && <SelectField label="Recorded session" name="sessionId" required value={sessionId} onChange={e => setSessionId(e.target.value)}><option value="">Select a recorded session</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</SelectField>}
    <div key={`${sessionId}:${type}`} className="space-y-4">
      <Field name="workDate" label="Work date" type="date" required defaultValue={selected?.date || initialWorkDate} hint="The date the scheduled period started." />
      {type !== "VOID" && <><SelectField name="scheduleSlotId" label="Assigned work period" defaultValue={selected?.slotId ?? ""} hint="Leave as unscheduled if the work was outside an assigned period."><option value="">Unscheduled work / no assigned period</option>{periods.map(p => <optgroup key={p.label} label={p.label}>{p.slots.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)}</SelectField>
        <FieldGrid><Field name="checkinAt" label="Actual check-in" type="datetime-local" step={1} required defaultValue={selected?.checkin} hint={timezone ? `Local time, ${timezone}` : undefined} /><Field name="checkoutAt" label="Actual checkout" type="datetime-local" step={1} required defaultValue={selected?.checkout} /></FieldGrid></>}
    </div></>;
}
