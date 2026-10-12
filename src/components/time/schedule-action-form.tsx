"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { publishAction } from "@/features/time/actions";
import { addDays } from "@/features/time/dates";
export function ScheduleActionForm({children,headerFields,from,until="",timezone,baseFrom,baseUntil,submitLabel}:{children:React.ReactNode;headerFields:React.ReactNode;from:string;until?:string;timezone:string;baseFrom?:string;baseUntil?:string;submitLabel:string}){
 const [range,setRange]=useState({from,until,duration:"INDEFINITE",scope:"FUTURE"});
 const replacement=baseFrom!==undefined,start=replacement&&range.scope==="SERIES"?baseFrom:range.from;
 let end=range.until;
 const automaticEnd=replacement?range.scope!=="CUSTOM":range.duration!=="CUSTOM";
 try {if(!replacement&&range.duration==="INDEFINITE")end="";else if(!replacement&&range.duration==="WEEK")end=addDays(start,7);else if(replacement&&(range.scope==="FUTURE"||range.scope==="SERIES"))end=baseUntil??"";else if(replacement&&range.scope==="OCCURRENCE")end=addDays(start,1);}catch{end="";}
 return <ActionForm action={publishAction} submitLabel={submitLabel} preserveValuesAfterSubmit confirmation={{title:"Publish this schedule?",description:"Check the effective dates, selected weekdays and work periods. Publication retains schedule history and attendance; a temporary replacement also restores the confirmed original pattern."}}>
  {headerFields}
  {replacement?<SelectField label="Change scope" name="editScope" value={range.scope} onChange={e=>setRange(current=>({...current,scope:e.target.value}))}><option value="OCCURRENCE">This occurrence date only (restore original next day)</option><option value="FUTURE">This date and future occurrences</option><option value="SERIES">Entire series (only future unstarted series)</option><option value="CUSTOM">Custom bounded range</option></SelectField>:<SelectField label="Recurrence" name="duration" value={range.duration} onChange={e=>setRange(current=>({...current,duration:e.target.value}))}><option value="INDEFINITE">Indefinite from effective start</option><option value="WEEK">One week only</option><option value="CUSTOM">Through optional effective end</option></SelectField>}
  <div className="grid gap-4 sm:grid-cols-2"><Field label="Effective start" name="effectiveFrom" type="date" required min={from} readOnly={replacement&&range.scope==="SERIES"} value={start} onInput={e=>{const next=e.currentTarget.value;setRange(current=>({...current,from:next}));}}/><Field label="Effective end (exclusive, optional)" name="effectiveUntil" type="date" min={start} readOnly={automaticEnd} value={end} onInput={e=>{const next=e.currentTarget.value;setRange(current=>({...current,until:next}));}}/></div>
  {children}
  <div className="rounded-xl border bg-slate-50 p-4 text-sm leading-6"><p className="font-semibold">Publication dates · {timezone}</p><p>Starts {start||"after a valid date is selected"} · {end?`ends ${end} (exclusive)`:"continues indefinitely"}</p><p className="text-muted-foreground">These dates are submitted with the work periods above. Existing overlapping assignments require an explicit future replacement.</p></div>
 </ActionForm>;
}
