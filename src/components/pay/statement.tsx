import Link from "next/link";
import type { salaryData } from "@/features/pay/periods";
import { durationLabel,addDays } from "@/features/time/dates";
import { decimal } from "@/features/pay/money";
import { label } from "./common";
type Statement=Awaited<ReturnType<typeof salaryData>>["records"][number];
export function SalaryStatement({row,own=false}:{row:Statement;own?:boolean}) {
 const snapshot="snapshot" in row?row.snapshot:undefined,final=row.period.status==="FINALIZED";
 return <article className="space-y-5 rounded-lg border bg-white p-5"><h2 className="text-xl font-semibold">{row.period.from.slice(0,7)} · {label(row.period.status)}</h2><p className={final?"text-emerald-800":"text-amber-800"}>{final?"Finalized salary":"Estimate — sources may still need review"}: <strong>{row.period.currency} {row.finalAmount}</strong></p>
 {snapshot && <><dl className="grid gap-3 sm:grid-cols-2">{[["Base compensation",row.baseAmount],["Approved overtime",row.overtimeAmount],["Approved commissions",row.commissionAmount],["Bonuses & allowances",row.bonusAmount],["Deductions (subtract)",row.deductionAmount],["Other adjustments & corrections",row.otherAmount]].map(([name,amount])=><div key={name}><dt className="text-sm text-muted-foreground">{name}</dt><dd className="font-medium">{row.period.currency} {amount}</dd></div>)}</dl>
 {snapshot.blockers.length>0 && <p className="rounded bg-amber-50 p-3 text-sm">Resolve before closeout: {snapshot.blockers.join("; ")}</p>}
 <p className="text-sm">Period ends {row.period.until} (exclusive). {snapshot.rounding}. Monthly terms use calendar-day proration; daily terms use regular scheduled coverage, capped at one day.</p>
 <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><caption className="py-2 text-left font-semibold">Recorded daily calculation inputs</caption><thead><tr>{["Date / attendance","Pay type","Regular time","Paid absence","Approved overtime","Daily units","Base contribution (4dp)"].map(t=><th key={t} className="p-2">{t}</th>)}</tr></thead><tbody>{snapshot.segments.map(d=><tr key={d.date} className="border-t"><td className="p-2"><Link className="text-blue-700" href={own?`/me/attendance?from=${d.date}&until=${addDays(d.date,1)}`:`/manage/employees/${snapshot.employeeId}/attendance/day?date=${d.date}`}>{d.date}</Link></td><td className="p-2">{d.payType??"Missing rate"}</td><td className="p-2">{durationLabel(d.regularSeconds)}</td><td className="p-2">{durationLabel(d.paidAbsenceSeconds)}</td><td className="p-2">{durationLabel(d.approvedOvertimeSeconds)}</td><td className="p-2">{decimal(d.dailyUnits).toFixed(4)}</td><td className="p-2 break-all">{decimal(d.baseUnrounded).toFixed(4)}</td></tr>)}</tbody></table></div>
 <details><summary className="cursor-pointer font-medium">Source records and approved adjustments</summary><div className="mt-3 space-y-3 text-sm"><Link className="block text-blue-700" href={own?"/me/compensation":`/manage/employees/${snapshot.employeeId}/compensation`}>Effective compensation history</Link>
 {((snapshot.sources.overtime??[]) as {week:string;reviewId:string|null;approvedSeconds:number}[]).map(w=><p key={w.week}><Link className="text-blue-700" href={`${own?"/me":"/manage"}/overtime?${own?"":`employeeId=${snapshot.employeeId}&`}week=${w.week}`}>Weekly overtime · {w.week}</Link> · approved {durationLabel(w.approvedSeconds)}</p>)}
 {snapshot.commissions.map(c=><p key={c.id}><Link className="text-blue-700" href={`${own?"/me":"/manage"}/commissions?id=${c.id}`}>{c.reference}</Link> · {row.period.currency} {c.amount} · source revision {c.revision}</p>)}
 {snapshot.adjustments.map(a=><p key={a.id}>{own?label(a.type):<Link className="text-blue-700" href={`/manage/adjustments?id=${a.id}`}>{label(a.type)}</Link>} · {row.period.currency} {a.amount} · {a.reason}</p>)}
 </div></details></>}
 </article>;
}
