import type { SlotInput } from "./validation";
// Wall-clock pattern; elapsed duration is still resolved by the existing timezone service.
export function standardDailyPattern(days:number[],startMinute:number):SlotInput[]{
 if(!Number.isInteger(startMinute)||startMinute<0||startMinute>1439||!days.length||days.some(d=>!Number.isInteger(d)||d<1||d>7)||new Set(days).size!==days.length)throw new Error("Choose distinct workdays and a valid start time.");
 return days.flatMap(weekday=>[0,480].map(offset=>{const start=(startMinute+offset)%1440,end=start+240;return {weekday:offset && startMinute+offset>=1440?weekday%7+1:weekday,startMinute:start,endMinute:end%1440,endDayOffset:Math.floor(end/1440)};}));
}
