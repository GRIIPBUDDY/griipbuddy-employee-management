import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { taskData } from "@/features/tasks/service";
import { Tasks } from "@/components/tasks/workspace";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){return <><h1 className="text-2xl font-semibold">My tasks</h1><Tasks data={await pageResult(taskData(await getIdentity(),await searchParams,true))}/></>;}
