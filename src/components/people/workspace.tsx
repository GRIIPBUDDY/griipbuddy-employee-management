import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Documents, UploadDocumentButton } from "./documents";
import { Timeline, NewWorkRecordButton } from "./records";
import { listDocuments } from "@/features/people/documents";
import { employeeTimeline } from "@/features/people/timeline";
import { pageResult } from "@/lib/auth/page-result";
import type { Identity } from "@/types/auth";
export async function workspaceData(identity: Identity | null, employeeId: string, staff: boolean) {
  const [documents, records] = await Promise.all([pageResult(listDocuments(identity, employeeId, !staff)), pageResult(employeeTimeline(identity, employeeId, !staff))]);
  return { documents, records };
}
export function DocumentsPanel({ documents, employeeId, staff }: { documents: Awaited<ReturnType<typeof listDocuments>>; employeeId: string; staff: boolean }) {
  return <Card><CardHeader actions={staff && <UploadDocumentButton employeeId={employeeId} />}><CardTitle>Private documents</CardTitle><CardDescription>Latest 100 accessible documents. PDFs download as attachments.</CardDescription></CardHeader><CardContent><Documents documents={documents} employeeId={employeeId} staff={staff} /></CardContent></Card>;
}
export function TimelinePanel({ records, employeeId, staff }: { records: Awaited<ReturnType<typeof employeeTimeline>>; employeeId: string; staff: boolean }) {
  return <Card><CardHeader actions={staff && <NewWorkRecordButton employeeId={employeeId} />}><CardTitle>Timeline</CardTitle><CardDescription>Latest 100 visible events, newest first.</CardDescription></CardHeader><CardContent><Timeline records={records} employeeId={employeeId} staff={staff} /></CardContent></Card>;
}
export async function EmployeeWorkspace({ identity, employeeId, staff }: { identity: Identity | null; employeeId: string; staff: boolean }) {
  const { documents, records } = await workspaceData(identity, employeeId, staff);
  return <><DocumentsPanel documents={documents} employeeId={employeeId} staff={staff} /><TimelinePanel records={records} employeeId={employeeId} staff={staff} /></>;
}
