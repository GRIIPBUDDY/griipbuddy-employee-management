import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { taskData } from "@/features/tasks/service";
import { employeeOptions } from "@/features/people/data";
import { Tasks } from "@/components/tasks/workspace";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const identity=await getIdentity(),q=await searchParams;return <><h1 className="text-2xl font-semibold">Task assignments</h1><Tasks data={await pageResult(taskData(identity,q))} employees={await pageResult(employeeOptions(identity))}/></>;}
