"use client";
import { useState } from "react";
import { Field,SelectField } from "@/components/ui/field";
export type SessionChoice={id:string;date:string;label:string;checkin:string;checkout:string;slotId:string};
export type PeriodGroup={label:string;slots:{id:string;label:string}[]};
export function CorrectionFields({sessions,periods,initialSessionId,initialWorkDate}:{sessions:SessionChoice[];periods:PeriodGroup[];initialSessionId:string;initialWorkDate:string}) {
 const [type,setType]=useState(initialSessionId?"REPLACE":"ADD"),[sessionId,setSessionId]=useState(initialSessionId);
 const selected=sessions.find(s=>s.id===sessionId);
 return <>
 <SelectField label="Correction type" name="type" value={type} onChange={e=>setType(e.target.value)}><option value="ADD">Missing session · ADD</option><option value="REPLACE">Incorrect time / missing checkout · REPLACE</option><option value="VOID">Erroneous session · VOID</option></SelectField>
 <SelectField label="Recorded session (REPLACE / VOID)" name="sessionId" disabled={type==="ADD"} required={type!=="ADD"} value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">Select recorded session</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</SelectField>
 <div key={`${sessionId}:${type}`} className="space-y-5">
 <Field name="workDate" label="Work date / scheduled occurrence start date" type="date" required defaultValue={selected?.date || initialWorkDate}/>
 {type!=="VOID" && <><SelectField name="scheduleSlotId" label="Assigned work period (optional)" defaultValue={selected?.slotId??""}><option value="">Unscheduled factual work / no assigned period</option>{periods.map(p=><optgroup key={p.label} label={p.label}>{p.slots.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)}</SelectField><Field name="checkinAt" label="Requested actual check-in" type="datetime-local" step={1} required defaultValue={selected?.checkin}/><Field name="checkoutAt" label="Requested actual checkout" type="datetime-local" step={1} required defaultValue={selected?.checkout}/></>}
 </div></>;
}
