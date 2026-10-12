"use client";
import { useRef, useState } from "react";
import { standardDailyPattern } from "@/features/time/default-pattern";
import { draftSlots, draftWeekdays, timeMinutes, weeklyDraftMinutes, type DraftSlot } from "@/features/time/schedule-draft";
import { Button } from "@/components/ui/button";
import { SelectField, Field } from "@/components/ui/field";
import type { SlotInput } from "@/features/time/validation";
import { minuteLabel } from "@/features/time/dates";
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export function ScheduleFields({initial=standardDailyPattern([1,2,3,4,5,6],540)}:{initial?:SlotInput[]}) {
 const [rows,setRows]=useState(()=>draftSlots(initial));
 const [start,setStart]=useState(minuteLabel(initial[0]?.startMinute??540));
 const nextKey=useRef(initial.length),days=draftWeekdays(rows),minutes=weeklyDraftMinutes(rows);
 const update=(key:number,patch:Partial<DraftSlot>)=>setRows(current=>current.map(row=>row.key===key?{...row,...patch}:row));
 const append=(slots:SlotInput[])=>{const added=draftSlots(slots,nextKey.current);nextKey.current+=added.length;setRows(current=>[...current,...added]);};
 return <div className="space-y-4">
  <fieldset className="space-y-4 rounded-xl border p-4"><legend className="px-1 font-semibold">Scheduled weekdays</legend>
   <p className="text-sm text-muted-foreground">Checked days match the work periods below. Unchecking a day removes its draft periods; published assignments stay unchanged until you confirm publication.</p>
   <div className="flex flex-wrap gap-x-5 gap-y-3">{weekdays.map((name,index)=><label key={name} className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={days.includes(index+1)} disabled={!days.includes(index+1)&&!Number.isFinite(timeMinutes(start))} onChange={e=>e.target.checked?append(standardDailyPattern([index+1],timeMinutes(start))):setRows(current=>current.filter(row=>row.weekday!==index+1))}/>{name}</label>)}</div>
   <Field label="Standard pattern first session start" name="presetStart" type="time" value={start} onInput={e=>setStart(e.currentTarget.value)}/>
   <p className="text-sm text-muted-foreground">The standard pattern is 4 hours work, 4 hours break, then 4 hours work. Apply it to replace the selected days’ draft times. Periods starting after midnight show their actual start weekday.</p>
   <Button type="button" variant="outline" disabled={!days.length||!Number.isFinite(timeMinutes(start))} onClick={()=>{const slots=standardDailyPattern(days,timeMinutes(start)),draft=draftSlots(slots,nextKey.current);nextKey.current+=draft.length;setRows(draft);}}>Use default pattern for selected days</Button>
  </fieldset>
  <p className="text-sm text-muted-foreground">Add or edit each weekly work period. Select “Next day” for overnight work. Removing all periods creates a rest pattern.</p>
  {rows.map((row,index)=><fieldset key={row.key} className="rounded-xl border p-4"><legend className="px-1 text-sm font-medium">Period {index+1}</legend><input type="hidden" name="slotKey" value={row.key}/><div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-5">
   <SelectField label="Weekday" name={`weekday-${row.key}`} value={row.weekday} onChange={e=>update(row.key,{weekday:Number(e.target.value)})}>{weekdays.map((name,i)=><option key={name} value={i+1}>{name}</option>)}</SelectField>
   <Field label="Start time" name={`start-${row.key}`} type="time" required value={row.start} onInput={e=>update(row.key,{start:e.currentTarget.value})}/>
   <Field label="End time" name={`end-${row.key}`} type="time" required value={row.end} onInput={e=>update(row.key,{end:e.currentTarget.value})}/>
   <SelectField label="End day" name={`endday-${row.key}`} value={row.endDayOffset} onChange={e=>update(row.key,{endDayOffset:Number(e.target.value)})}><option value={0}>Same day</option><option value={1}>Next day</option></SelectField>
   <Button type="button" variant="outline" onClick={()=>setRows(current=>current.filter(s=>s.key!==row.key))} aria-label={`Remove period ${index+1}`}>Remove</Button>
  </div></fieldset>)}
  <Button type="button" variant="outline" onClick={()=>append([{weekday:days[0]??1,startMinute:540,endMinute:780,endDayOffset:0}])}>Add period</Button>
  <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm font-medium">{rows.length?`${rows.length} work periods · ${days.map(day=>weekdays[day-1]).join(", ")} · ${minutes===null?"Complete valid, nonoverlapping times":`${Math.floor(minutes/60)} hours ${minutes%60} minutes per recurring week`}`:"Rest pattern · no scheduled work periods"}</p>
 </div>;
}
