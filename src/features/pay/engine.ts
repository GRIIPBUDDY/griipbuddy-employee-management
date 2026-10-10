import { Temporal } from "@js-temporal/polyfill";
import { decimal,money,sumMoney } from "./money";
import { intersect,subtract,seconds,type Interval } from "@/features/review/calculation";
export type RateFact={id:string;employmentPeriodId:string;effectiveFrom:string;effectiveUntil:string|null;payType:string;baseAmount:string;overtimeHourlyEquivalent:string|null;overtimeMultiplier:string;currency:string;revision:number};
export type PayDay={date:string;employmentPeriodId:string;rate:RateFact|null;actual:Interval[];scheduled:Interval[];paidAbsence:Interval[];approvedOvertime:Interval[]};
export type PayInput={employeeId:string;period:{id:string;from:string;until:string;timezone:string;currency:string;inputRevision:number};days:PayDay[];sources:Record<string,unknown>;commissions:{id:string;reference:string;amount:string;revision:number;orderAt:string}[];adjustments:{id:string;type:string;amount:string;reason:string;revision:number;commissionRelated:boolean}[];blockers:string[]};
export function calculatePay(input:PayInput) {
 let base=decimal(0),overtime=decimal(0);
 const monthDays=Temporal.PlainDate.from(input.period.from).daysInMonth;
 const segments=input.days.map(day=>{
  const rate=day.rate,regular=subtract(day.actual,day.approvedOvertime),regularSeconds=seconds(regular),paidSeconds=seconds(day.paidAbsence),scheduledSeconds=seconds(day.scheduled),overtimeSeconds=seconds(day.approvedOvertime);
  const coveredSeconds=seconds([...intersect(regular,day.scheduled),...day.paidAbsence]);
  const dailyUnits=scheduledSeconds?decimal(coveredSeconds).div(scheduledSeconds).clamp(0,1):decimal(0);
  let ordinary=decimal(0),premium=decimal(0);
  if(rate){
   if(rate.payType==="MONTHLY")ordinary=decimal(rate.baseAmount).div(monthDays);
   else if(rate.payType==="HOURLY")ordinary=decimal(rate.baseAmount).times(regularSeconds+paidSeconds).div(3600);
   else ordinary=decimal(rate.baseAmount).times(dailyUnits);
   if(overtimeSeconds && (rate.payType==="HOURLY" || rate.overtimeHourlyEquivalent!==null))premium=decimal(rate.payType==="HOURLY"?rate.baseAmount:rate.overtimeHourlyEquivalent!).times(rate.overtimeMultiplier).times(overtimeSeconds).div(3600);
  }
  base=base.plus(ordinary);overtime=overtime.plus(premium);
  return {date:day.date,employmentPeriodId:day.employmentPeriodId,rateId:rate?.id??null,payType:rate?.payType??null,actualSeconds:seconds(day.actual),regularSeconds,paidAbsenceSeconds:paidSeconds,scheduledSeconds,coveredRegularSeconds:coveredSeconds,dailyUnits:dailyUnits.toString(),approvedOvertimeSeconds:overtimeSeconds,baseUnrounded:ordinary.toString(),overtimeUnrounded:premium.toString(),actual:day.actual,scheduled:day.scheduled,paidAbsence:day.paidAbsence,approvedOvertime:day.approvedOvertime};
 });
 const components={baseAmount:money(base),overtimeAmount:money(overtime),commissionAmount:money(sumMoney(input.commissions.map(c=>c.amount))),bonusAmount:money(sumMoney(input.adjustments.filter(a=>a.type==="BONUS").map(a=>a.amount))),deductionAmount:money(sumMoney(input.adjustments.filter(a=>a.type==="DEDUCTION").map(a=>a.amount))),otherAmount:money(sumMoney(input.adjustments.filter(a=>["OTHER","CORRECTION"].includes(a.type)).map(a=>a.amount)))};
 const finalAmount=money(decimal(components.baseAmount).plus(components.overtimeAmount).plus(components.commissionAmount).plus(components.bonusAmount).plus(components.otherAmount).minus(components.deductionAmount));
 return {...components,finalAmount,calculationSnapshot:{formatVersion:1,formulaVersion:"calendar-month-v1",rounding:"Decimal precision 40; each component half-up to two decimals; final sums rounded components",employeeId:input.employeeId,period:input.period,commissionRelated:input.commissions.length>0 || input.adjustments.some(a=>a.commissionRelated),sources:input.sources,segments,commissions:input.commissions,adjustments:input.adjustments,blockers:input.blockers}};
}
