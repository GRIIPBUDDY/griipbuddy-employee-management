import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { isScheduleConflict } from "@/features/time/schedule-conflicts";
import { draftSlots,draftWeekdays,weeklyDraftMinutes } from "@/features/time/schedule-draft";
import { standardDailyPattern } from "@/features/time/default-pattern";
import { publishSchema } from "@/features/time/validation";
const native=(code="23P01",message='conflicting key value violates exclusion constraint "schedules_no_overlap"')=>({code:"P2039",meta:{driverAdapterError:{cause:{originalCode:code,originalMessage:message}}}});
it("maps the installed adapter's exclusion code while leaving unrelated database errors unexpected",()=>{
 expect(isScheduleConflict(native())).toBe(true);expect(isScheduleConflict(native("23514"))).toBe(false);expect(isScheduleConflict(native("23P01",'constraint "another_table_no_overlap"'))).toBe(false);expect(isScheduleConflict({code:"P2039"})).toBe(false);expect(isScheduleConflict(new Error("network unavailable"))).toBe(false);
});
it("makes loaded weekdays reflect all saved periods, including Sunday",()=>{
 const all=draftSlots(standardDailyPattern([1,2,3,4,5,6,7],480));expect(draftWeekdays(all)).toEqual([1,2,3,4,5,6,7]);expect(weeklyDraftMinutes(all)).toBe(56*60);
 const six=all.filter(s=>s.weekday!==7);expect(six).toHaveLength(12);expect(draftWeekdays(six)).toEqual([1,2,3,4,5,6]);expect(weeklyDraftMinutes(six)).toBe(48*60);
});
it("detects incomplete, overlapping and cyclic overnight draft periods",()=>{
 const rows=draftSlots(standardDailyPattern([1],480));expect(weeklyDraftMinutes(rows.map((s,i)=>i?{...s,start:"10:00"}:s))).toBeNull();expect(weeklyDraftMinutes([{...rows[0],start:""}])).toBeNull();expect(weeklyDraftMinutes([{key:0,weekday:7,start:"22:00",end:"02:00",endDayOffset:1},{key:1,weekday:1,start:"01:00",end:"03:00",endDayOffset:0}])).toBeNull();expect(weeklyDraftMinutes([])).toBe(0);
});
const input=()=>({employeeId:randomUUID(),employmentPeriodId:randomUUID(),effectiveFrom:"2030-01-07",effectiveUntil:"",label:"",reason:"Weekly Work Hour",slots:standardDailyPattern([1,2,3,4,5,6],480)});
it("validates computed one-week bounds before the temporary holiday-work rule",()=>{
 const parsed=publishSchema.parse({...input(),duration:"WEEK",holidayWorkRequired:true});expect(parsed.effectiveUntil).toBe("2030-01-14");
});
it("treats indefinite recurrence as unbounded even if an unused end field retains a date",()=>{
 expect(publishSchema.parse({...input(),duration:"INDEFINITE",effectiveUntil:"2030-01-06"}).effectiveUntil).toBeNull();
 expect(publishSchema.safeParse({...input(),duration:"INDEFINITE",effectiveUntil:"2030-01-14",holidayWorkRequired:true}).success).toBe(false);
});
