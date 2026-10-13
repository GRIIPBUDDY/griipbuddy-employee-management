import { minuteLabel } from "./dates";
import type { SlotInput } from "./validation";
import { validatePattern } from "./occurrences";
export type DraftSlot = { key: number; weekday: number; start: string; end: string; endDayOffset: number };
export const draftSlots = (slots:SlotInput[],key=0):DraftSlot[] => slots.map((s,index)=>({key:key+index,weekday:s.weekday,start:minuteLabel(s.startMinute),end:minuteLabel(s.endMinute),endDayOffset:s.endDayOffset}));
export const draftWeekdays = (rows:DraftSlot[]) => [...new Set(rows.map(row=>row.weekday))].sort((a,b)=>a-b);
export function timeMinutes(time:string) {
 if (!/^\d{2}:\d{2}$/.test(time)) return NaN;
 const [hour,minute]=time.split(":").map(Number);return hour<=23&&minute<=59?hour*60+minute:NaN;
}
export function weeklyDraftMinutes(rows:DraftSlot[]):number|null {
 let total=0;
 for(const row of rows){const duration=timeMinutes(row.end)+1440*row.endDayOffset-timeMinutes(row.start);if(!Number.isFinite(duration)||duration<=0||duration>1440)return null;total+=duration;}
 try {validatePattern(rows.map(row=>({weekday:row.weekday,startMinute:timeMinutes(row.start),endMinute:timeMinutes(row.end),endDayOffset:row.endDayOffset})));}catch{return null;}
 return total;
}
