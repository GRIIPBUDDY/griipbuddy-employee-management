import Link from "next/link";
import { NotebookText, Plus } from "lucide-react";
import { Field, SelectField, TextAreaField, CheckboxField, FieldGrid } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { recordAction, correctRecordAction, deleteRecordAction } from "@/features/people/actions";
import type { employeeTimeline } from "@/features/people/timeline";
type Record = Awaited<ReturnType<typeof employeeTimeline>>[number];
const words = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase());
function RecordFields({ record }: { record?: Record }) {
  return <><FieldGrid><SelectField label="Record type" name="type" defaultValue={record?.type ?? "WORK_NOTE"}>{["ACHIEVEMENT", "WORK_NOTE", "TRAINING", "ONBOARDING", "IMPORTANT_EVENT", "OTHER"].map(type => <option key={type} value={type}>{words(type)}</option>)}</SelectField><Field label="Event date" name="eventDate" type="date" required defaultValue={record?.eventTime.toISOString().slice(0, 10)} /></FieldGrid><Field label="Title" name="title" required maxLength={150} defaultValue={record?.title} /><TextAreaField label="Description" name="description" required maxLength={5000} defaultValue={record?.description} /><CheckboxField name="employeeVisible" defaultChecked={record?.employeeVisible ?? false} label="Release to the employee" description="Visible in the employee’s work records and timeline." /></>;
}
export function WorkRecordForm({ employeeId }: { employeeId: string }) {
  return <ActionForm action={recordAction} submitLabel="Create work record" resetOnSuccess><input type="hidden" name="employeeId" value={employeeId} /><RecordFields /></ActionForm>;
}
export function NewWorkRecordButton({ employeeId }: { employeeId: string }) {
  return <Dialog trigger={<><Plus size={16} aria-hidden="true" />Add work record</>} title="Add a work record" description="Achievements, training, onboarding notes and other important events."><WorkRecordForm employeeId={employeeId} /></Dialog>;
}
export function Timeline({ records, employeeId, staff }: { records: Record[]; employeeId: string; staff: boolean }) {
  if (!records.length) return <EmptyState icon={NotebookText} title="No timeline entries yet" description={staff ? "Work records and official events will appear here." : "Records released to you will appear here."} />;
  return <ol className="relative space-y-4 border-l pl-6">{records.map(record => <li key={record.id} className="relative">
    <span aria-hidden="true" className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary ring-2 ring-primary-soft" />
    <div className="rounded-xl border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-medium text-muted-foreground">{record.eventTime.toISOString().slice(0, 10)} · {words(record.type)}</p><h3 className="mt-0.5 font-semibold">{record.title}</h3></div>{staff && <StatusBadge status={record.employeeVisible ? "PUBLISHED" : "DRAFT"} label={record.employeeVisible ? "Released" : "Staff only"} />}</div>
      {record.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#344054]">{record.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><span>Recorded by {record.creatorName} · {record.createdAt.toISOString().slice(0, 10)}</span>{record.href && <Link className="link" href={record.href}>Open source record</Link>}
        {staff && record.manual && <span className="ml-auto flex gap-1"><Dialog triggerSize="sm" variant="ghost" trigger="Correct" title="Correct work record" description="The original content is retained in the audit log."><ActionForm action={correctRecordAction} submitLabel="Save correction"><input type="hidden" name="employeeId" value={employeeId} /><input type="hidden" name="recordId" value={record.id} /><input type="hidden" name="expectedUpdatedAt" value={record.updatedAt.toISOString()} /><RecordFields record={record} /><Field label="Correction reason" name="reason" required maxLength={500} /></ActionForm></Dialog>
          <Dialog triggerSize="sm" variant="ghost" triggerClassName="text-danger hover:bg-danger-soft hover:text-danger" trigger="Remove" title="Remove from timeline"><ActionForm action={deleteRecordAction} submitLabel="Remove record" confirmation={{ title: "Remove this record?", description: "It will be hidden from the timeline. The audit history is retained.", label: "Remove", destructive: true }}><input type="hidden" name="employeeId" value={employeeId} /><input type="hidden" name="recordId" value={record.id} /><Field label="Removal reason" name="reason" required maxLength={500} /></ActionForm></Dialog></span>}</div>
    </div>
  </li>)}</ol>;
}
