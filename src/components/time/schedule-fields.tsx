"use client";
import { standardDailyPattern } from "@/features/time/default-pattern";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, Field } from "@/components/ui/field";
import type { SlotInput } from "@/features/time/validation";
import { minuteLabel } from "@/features/time/dates";
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export function ScheduleFields({ initial = [] }: { initial?: SlotInput[] }) {
  const [rows, setRows] = useState(initial.map((slot, index) => ({ ...slot, key: index })));
  const [start,setStart]=useState("09:00"),[days,setDays]=useState([1,2,3,4,5,6]);
  const [nextKey, setNextKey] = useState(initial.length);
  return <div className="space-y-4">
    <fieldset className="space-y-3 rounded-lg border p-4"><legend>Default 4 hours work · 4 hours break · 4 hours work</legend><label>First session start <input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label><div>{weekdays.map((name,i)=><label key={name} className="mr-3 inline-flex gap-1"><input type="checkbox" checked={days.includes(i+1)} onChange={e=>setDays(e.target.checked?[...days,i+1].sort():days.filter(d=>d!==i+1))}/>{name}</label>)}</div><Button type="button" variant="outline" disabled={!days.length || !start} onClick={()=>{const [h,m]=start.split(":").map(Number),slots=standardDailyPattern(days,h*60+m);setRows(slots.map((s,i)=>({...s,key:nextKey+i})));setNextKey(nextKey+slots.length);}}>Use default pattern for selected days</Button></fieldset>
    <p className="text-sm text-muted-foreground">Add each weekly work period. Select “Next day” for overnight work. An empty pattern cancels scheduled work for these dates.</p>
    {rows.map((s, index) => <fieldset key={s.key} className="rounded-lg border p-4"><legend className="px-1 text-sm font-medium">Period {index + 1}</legend><input type="hidden" name="slotKey" value={s.key} /><div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <SelectField label="Weekday" name={`weekday-${s.key}`} defaultValue={s.weekday}>{weekdays.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</SelectField>
      <Field label="Start time" name={`start-${s.key}`} type="time" required defaultValue={minuteLabel(s.startMinute)} />
      <Field label="End time" name={`end-${s.key}`} type="time" required defaultValue={minuteLabel(s.endMinute)} />
      <SelectField label="End day" name={`endday-${s.key}`} defaultValue={s.endDayOffset}><option value={0}>Same day</option><option value={1}>Next day</option></SelectField>
      <Button type="button" variant="outline" onClick={() => setRows(rows.filter(row => row.key !== s.key))} aria-label={`Remove period ${index + 1}`}>Remove</Button>
    </div></fieldset>)}
    <Button type="button" variant="outline" onClick={() => { setRows([...rows, { key: nextKey, weekday: 1, startMinute: 540, endMinute: 780, endDayOffset: 0 }]); setNextKey(nextKey + 1); }}>Add period</Button>
  </div>;
}
