import {getIdentity} from "@/lib/auth/request";import {pageResult} from "@/lib/auth/page-result";
import {recordData,recordOptions} from "@/features/people-operations/records";import {RecordWorkspace,RecordFilters,OperationsNav,PageLinks} from "@/components/people-operations/records";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const raw=await searchParams,q=Object.fromEntries(Object.entries(raw).filter((v):v is [string,string]=>typeof v[1]==='string'&&v[1]!=='')),identity=await getIdentity(),data=await pageResult(recordData(identity,"warnings",q,true));
 const employeeId=q.employeeId??(q.id&&data.records[0]&&"employeeId" in data.records[0]?data.records[0].employeeId:undefined),options=await pageResult(recordOptions(identity,employeeId));
 return <><h1 className="text-3xl font-semibold">Warnings & official notices</h1><OperationsNav staff={true}/><RecordFilters options={options} kind="warnings" query={q}/><RecordWorkspace data={data} kind="warnings" staff={true} options={options} employeeId={employeeId}/><PageLinks page={data.page} hasNext={data.hasNext} query={q}/></>;
}
