import { addDays, dayStart, weekday } from "@/features/time/dates";
import { AppError } from "@/lib/utils/errors";
export type Interval = { start: number; end: number };
export const interval = (start: Date, end: Date): Interval => ({ start: start.getTime() / 1000, end: end.getTime() / 1000 });
export function union(values: Interval[]) {
 const result: Interval[] = [];
 for (const value of values.filter(v => v.end > v.start).sort((a,b) => a.start-b.start || a.end-b.end)) {
  const previous = result.at(-1);
  if (previous && value.start <= previous.end) previous.end = Math.max(previous.end,value.end); else result.push({...value});
 }
 return result;
}
export const seconds = (values: Interval[]) => union(values).reduce((sum,v) => sum+v.end-v.start,0);
export function intersect(values: Interval[], windows: Interval[]) {
 return union(values.flatMap(a => windows.map(b => ({ start: Math.max(a.start,b.start), end: Math.min(a.end,b.end) }))));
}
export function subtract(values: Interval[], removed: Interval[]) {
 let result = union(values);
 for (const b of union(removed)) result = result.flatMap(a => b.end<=a.start || b.start>=a.end ? [a] : [{ start:a.start,end:Math.min(a.end,b.start) },{ start:Math.max(a.start,b.end),end:a.end }].filter(v=>v.end>v.start));
 return result;
}
export function tail(values: Interval[], quantity: number) {
 const result: Interval[]=[]; let remaining=quantity;
 for(const v of union(values).reverse()) { const take=Math.min(remaining,v.end-v.start); if(take>0) result.push({start:v.end-take,end:v.end}); remaining-=take; }
 return result.reverse();
}
export const localWeek = (date:string, firstDay=1) => addDays(date,-((weekday(date)-firstDay+7)%7));
export type Policy = { effectiveFrom:string; thresholdSeconds:number; ruleVersion:number };
export function policies(value: unknown): Policy[] {
 if(!Array.isArray(value)) throw new AppError(409,"POLICY_INVALID","Overtime policy history requires administrator review.");
 const rows = value.map((v,i) => ({effectiveFrom:v.effectiveFrom,thresholdSeconds:v.thresholdSeconds,ruleVersion:v.ruleVersion ?? i+1}));
 if(rows.some((v,i)=>!/^\d{4}-\d{2}-\d{2}$/.test(v.effectiveFrom) || !Number.isInteger(v.thresholdSeconds) || v.thresholdSeconds<=0 || !Number.isInteger(v.ruleVersion) || v.ruleVersion<=0 || i>0 && (v.effectiveFrom<=rows[i-1].effectiveFrom || v.ruleVersion<=rows[i-1].ruleVersion))) throw new AppError(409,"POLICY_INVALID","Overtime policy history requires administrator review.");
 return rows;
}
export function policyFor(value:unknown, week:string) {
 // Bootstrap's original 40-hour policy also covers earlier weeks; [] is the legacy initialization default.
 const rows=policies(value);
 return rows.filter(v=>v.effectiveFrom<=week).at(-1) ?? rows[0] ?? {effectiveFrom:"0001-01-01",thresholdSeconds:144000,ruleVersion:1};
}
export function attendanceMetrics(scheduled:Interval[], excused:Interval[], actual:Interval[], open:Interval[], now:number) {
 const required=subtract(scheduled,excused), worked=union(actual), missing=subtract(required,worked), ended=required.filter(v=>v.end<now);
 const absent=ended.filter(v=>seconds(intersect(worked,[v]))===0 && seconds(intersect(open,[v]))===0);
 let late=0,early=0;
 for(const r of required) {
  const coverage=intersect(worked,[r]);
  if(coverage.length) { late+=coverage[0].start-r.start; if(r.end<now && !seconds(intersect(open,[r]))) early+=r.end-coverage.at(-1)!.end; }
 }
 return {scheduledSeconds:seconds(scheduled),requiredSeconds:seconds(required),actualSeconds:seconds(worked),missingSeconds:seconds(missing),lateSeconds:late,earlySeconds:early,
  extraSeconds:seconds(subtract(worked,scheduled)),absenceCount:absent.length,excusedSeconds:seconds(intersect(scheduled,excused)),provisional:seconds(intersect(open,required))>0};
}
export const windowFor = (date:string,days:number,timezone:string) => interval(dayStart(date,timezone),dayStart(addDays(date,days),timezone));
