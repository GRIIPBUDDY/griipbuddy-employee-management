import {getIdentity} from "@/lib/auth/request";import {pageResult} from "@/lib/auth/page-result";
import {recordData} from "@/features/people-operations/records";import {RecordWorkspace,OperationsNav,PageLinks} from "@/components/people-operations/records";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const raw=await searchParams,q=Object.fromEntries(Object.entries(raw).filter((v):v is [string,string]=>typeof v[1]==='string'&&v[1]!=='')),identity=await getIdentity(),data=await pageResult(recordData(identity,"performance",q,false));
 
 return <><h1 className="text-3xl font-semibold">My performance reviews</h1><OperationsNav staff={false}/><RecordWorkspace data={data} kind="performance" staff={false}/><PageLinks page={data.page} hasNext={data.hasNext} query={q}/></>;
}
