import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Documents } from "./documents";
import { Timeline, WorkRecordForm } from "./records";
import { listDocuments } from "@/features/people/documents";
import { employeeTimeline } from "@/features/people/timeline";
import { pageResult } from "@/lib/auth/page-result";
import type { Identity } from "@/types/auth";
export async function EmployeeWorkspace({ identity, employeeId, staff }: { identity: Identity | null; employeeId: string; staff: boolean }) {
  const [documents, records] = await Promise.all([pageResult(listDocuments(identity, employeeId, !staff)), pageResult(employeeTimeline(identity, employeeId, !staff))]);
  return <><Card id="documents"><CardHeader><CardTitle>Private documents</CardTitle><CardDescription>Latest 100 accessible documents. PDFs download as attachments.</CardDescription></CardHeader><CardContent><Documents documents={documents} employeeId={employeeId} staff={staff} /></CardContent></Card><Card id="timeline"><CardHeader><CardTitle>Employee timeline</CardTitle><CardDescription>Latest 100 visible events, newest first.</CardDescription></CardHeader><CardContent><div className="space-y-6">{staff && <details><summary className="cursor-pointer text-sm font-medium text-blue-700">Create a work record</summary><div className="mt-4 rounded-lg border p-4"><WorkRecordForm employeeId={employeeId} /></div></details>}<Timeline records={records} employeeId={employeeId} staff={staff} /></div></CardContent></Card></>;
}
