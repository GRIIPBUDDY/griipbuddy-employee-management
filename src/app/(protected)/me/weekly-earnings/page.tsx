import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { weeklyData,monthToDate } from "@/features/pay/weekly";
import { WeeklyStatements } from "@/components/pay/weekly";
import { Earnings } from "@/components/pay/earnings";
export default async function Page(){const i=await getIdentity();return <><h1 className="text-2xl font-semibold">My earnings</h1><Earnings data={await pageResult(monthToDate(i))}/><WeeklyStatements rows={await pageResult(weeklyData(i,true))}/></>;}
