import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { salaryData } from "@/features/pay/periods";
import { SalaryStatement } from "@/components/pay/statement";
export default async function Page({params}:{params:Promise<{id:string}>}) {const data=await pageResult(salaryData(await getIdentity(),{id:(await params).id},true));return <><h1 className="text-3xl font-semibold">My salary statement</h1><SalaryStatement row={data.records[0]} own/></>;}
