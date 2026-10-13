import Link from "next/link";
import { Plus, Star, TriangleAlert } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextAreaField, CheckboxField, FieldGrid } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { DescriptionList } from "@/components/ui/description-list";
import { Alert } from "@/components/ui/alert";
import { Hidden } from "@/components/review/forms";
import { peopleOperationsAction } from "@/features/people-operations/actions";
import type { recordData, recordOptions, RecordKind } from "@/features/people-operations/records";
import { dateKey, addDays, displayInstant } from "@/features/time/dates";
import { rangeLabel } from "@/lib/utils/date-range";
type Defaults = Record<string, string | number | boolean | null | Date>;
type Options = Awaited<ReturnType<typeof recordOptions>>;
const words = (v: string) => v[0] + v.slice(1).toLowerCase().replaceAll("_", " ");
const severities = ["NOTICE", "WARNING", "SERIOUS_WARNING", "FINAL_WARNING"];
export function TextArea({ label, name, value = "", required = false, maxLength = 2000 }: { label: string; name: string; value?: string; required?: boolean; maxLength?: number }) { return <TextAreaField label={label} name={name} defaultValue={value} maxLength={maxLength} required={required} rows={3} />; }
function RecordFields({ kind, defaults = {}, options }: { kind: RecordKind; defaults?: Defaults; options: Options }) {
  const s = (k: string) => String(defaults[k] ?? ""), date = (k: string) => defaults[k] instanceof Date ? dateKey(defaults[k] as Date) : s(k);
  return <>
    <SelectField label="Employment record" name="employmentPeriodId" defaultValue={s("employmentPeriodId")} required><option value="">Choose employment record</option>{options.stints.map(p => <option key={p.id} value={p.id}>{dateKey(p.startDate)} → {p.endDate ? dateKey(p.endDate) : "ongoing"}</option>)}</SelectField>
    {kind === "performance" ? <>
      <FieldGrid><Field label="Review period starts" name="startDate" type="date" defaultValue={date("startDate")} required /><Field label="Review period ends before" name="endDate" type="date" defaultValue={date("endDate")} required hint="Exclusive end date." /></FieldGrid>
      <fieldset><legend className="mb-1.5 text-sm font-medium">Ratings (1–5, optional while in draft)</legend><div className="grid gap-3 sm:grid-cols-3">{[["overallRating", "Overall"], ["productivity", "Productivity"], ["workQuality", "Work quality"], ["communication", "Communication"], ["attendance", "Attendance"], ["responsibility", "Responsibility"]].map(([name, label]) => <Field key={name} label={label} name={name} type="number" min={1} max={5} defaultValue={s(name)} />)}</div></fieldset>
      <TextArea label="Strengths" name="strengths" value={s("strengths")} /><TextArea label="Improvement areas" name="improvementAreas" value={s("improvementAreas")} /><TextArea label="Reviewer comments" name="reviewerComments" value={s("reviewerComments")} />
    </> : <>
      <FieldGrid><Field label="Record date" name="issueDate" type="date" defaultValue={date("issueDate")} required /><SelectField label="Severity" name="severity" defaultValue={s("severity") || "NOTICE"}>{severities.map(t => <option key={t} value={t}>{words(t)}</option>)}</SelectField></FieldGrid>
      <Field label="Reason" name="reason" defaultValue={s("reason")} required maxLength={500} /><TextArea label="Description" name="description" value={s("description")} /><TextArea label="Action taken" name="actionTaken" value={s("actionTaken")} />
      <SelectField label="Attachment (existing private document)" name="attachmentDocumentId" defaultValue={s("attachmentDocumentId")}><option value="">No attachment</option>{options.documents.map(d => <option key={d.id} value={d.id}>{d.displayName}</option>)}</SelectField>
      <CheckboxField name="acknowledgementRequested" defaultChecked={!!defaults.acknowledgementRequested} label="Request receipt acknowledgement" description="The employee confirms receipt only; it does not imply agreement." />
    </>}
    <TextArea label="Private staff notes" name="staffNotes" value={s("staffNotes")} /><CheckboxField name="employeeVisible" defaultChecked={!!defaults.employeeVisible} label="Release to the employee when finalized" description="Private staff notes are never shown to the employee." />
  </>;
}
export function NewRecordButton({ kind, options, employeeId }: { kind: RecordKind; options: Options; employeeId?: string }) {
  const title = kind === "performance" ? "New performance review" : "New warning or notice";
  if (!employeeId) return <Dialog variant="default" trigger={<><Plus size={16} aria-hidden="true" />{title}</>} title={title} size="sm"><Alert tone="info">Choose an employee in the filters first, then create the draft for that employee.</Alert></Dialog>;
  const name = options.employees.find(e => e.id === employeeId)?.legalName ?? "employee";
  return <Dialog sheet variant="default" trigger={<><Plus size={16} aria-hidden="true" />{title}</>} title={`${title} · ${name}`} description="Saved as a private draft. Finalizing records the official version; releasing makes it visible to the employee."><ActionForm action={peopleOperationsAction} submitLabel="Save draft"><Hidden values={{ kind: kind === "performance" ? "performanceCreate" : "warningCreate", employeeId }} /><RecordFields kind={kind} options={options} /></ActionForm></Dialog>;
}
export function RecordWorkspace({ data, kind, staff, options, employeeId, timezone }: { data: Awaited<ReturnType<typeof recordData>>; kind: RecordKind; staff: boolean; options?: Options; employeeId?: string; timezone: string }) {
  if (!data.records.length) return <EmptyState icon={kind === "performance" ? Star : TriangleAlert} title={kind === "performance" ? "No performance reviews" : "No warnings or notices"} description={staff ? "Records matching these filters will appear here." : "Records released to you will appear here."} />;
  return <div className="space-y-3">{data.records.map(r => {
    const isReview = "overallRating" in r, revoked = "revokedAt" in r && r.revokedAt, defaults = r as unknown as Defaults, status = revoked ? "REVOKED" : r.publishedAt ? "PUBLISHED" : "DRAFT";
    return <Card key={r.id}><CardHeader actions={<div className="flex flex-wrap gap-1.5">{!isReview && <StatusBadge status={r.severity === "FINAL_WARNING" || r.severity === "SERIOUS_WARNING" ? "REJECTED" : "PENDING"} label={words(r.severity)} />}<StatusBadge status={status} label={revoked ? "Revoked" : r.publishedAt ? "Finalized" : "Draft"} />{staff && "employeeVisible" in r && <StatusBadge status={r.employeeVisible ? "INFO" : "DRAFT"} tone={r.employeeVisible ? "info" : "neutral"} label={r.employeeVisible ? "Released" : "Staff only"} />}</div>}>
      <CardTitle>{staff && r.employee ? `${r.employee.legalName} · ` : ""}{isReview ? `Review · ${rangeLabel(dateKey(r.startDate), addDays(dateKey(r.endDate), -1))}` : `${dateKey(r.issueDate)} · ${r.reason}`}</CardTitle>
      <CardDescription>{isReview ? "Reviewer" : "Issued by"} {r.reviewerName ?? "— (draft)"} · updated {displayInstant(r.updatedAt, timezone)}</CardDescription></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isReview ? <><DescriptionList columns={3} items={[["Overall", r.overallRating ? `${r.overallRating} / 5` : "Not rated"], ...(["productivity", "workQuality", "communication", "attendance", "responsibility"] as const).map(k => [k === "workQuality" ? "Work quality" : words(k.toUpperCase()), defaults[k] ? `${defaults[k]} / 5` : null] as [string, string | null])]} />
          <div className="grid gap-3 lg:grid-cols-3">{[["Strengths", r.strengths], ["Improvement areas", r.improvementAreas], ["Reviewer comments", r.reviewerComments]].map(([k, v]) => <div key={k} className="rounded-lg bg-subtle px-3 py-2"><p className="text-xs font-medium text-muted-foreground">{k}</p><p className="mt-1 whitespace-pre-wrap leading-6">{v || "—"}</p></div>)}</div></>
          : <><p className="whitespace-pre-wrap leading-6">{r.description}</p>{r.actionTaken && <p className="rounded-lg bg-subtle px-3 py-2"><span className="font-medium">Action taken:</span> {r.actionTaken}</p>}
            <p className="text-muted-foreground">{r.acknowledgedAt ? `Receipt acknowledged ${displayInstant(r.acknowledgedAt, timezone)}` : r.acknowledgementRequested ? "Receipt acknowledgement requested" : "No acknowledgement requested"}. Acknowledgement does not imply agreement.</p>
            {r.attachmentDocumentId && <Link className="link" href={staff ? `/api/employees/${String(defaults.employeeId)}/documents/${r.attachmentDocumentId}` : `/api/me/documents/${r.attachmentDocumentId}`}>Download attachment</Link>}
            {!staff && r.acknowledgementRequested && !r.acknowledgedAt && !revoked && <ActionForm compact action={peopleOperationsAction} submitLabel="Acknowledge receipt" confirmation={{ title: "Acknowledge receipt?", description: "This confirms you received the notice. It does not mean you agree with it.", label: "Acknowledge" }}><Hidden values={{ kind: "acknowledge", id: r.id, revision: r.revision }} /></ActionForm>}</>}
        {staff && "staffNotes" in r && r.staffNotes && <p className="rounded-lg border border-dashed px-3 py-2 text-muted-foreground"><span className="font-medium text-foreground">Private staff notes:</span> {r.staffNotes}</p>}
        {staff && <div className="flex flex-wrap gap-2">
          {"canPublish" in r && !r.canPublish && <span className="text-xs text-muted-foreground">An administrator must finalize or correct your own record.</span>}
          {"canPublish" in r && r.canPublish && !revoked && !r.publishedAt && <ActionForm compact action={peopleOperationsAction} submitSize="sm" submitLabel="Finalize" confirmation={{ title: "Finalize this record?", description: r.employeeVisible ? "The official version is recorded and released to the employee, who is notified." : "The official version is recorded. It stays staff-only.", label: "Finalize" }}><Hidden values={{ kind: isReview ? "performancePublish" : "warningPublish", id: r.id, revision: r.revision }} /></ActionForm>}
          {!revoked && options && employeeId && defaults.employeeId === employeeId && (!r.publishedAt || "canPublish" in r && r.canPublish) && <Dialog sheet triggerSize="sm" variant="outline" trigger={r.publishedAt ? "Correct record" : "Edit draft"} title={r.publishedAt ? "Correct official record" : "Edit draft"} description={r.publishedAt ? "Previous values are retained in the audit log." : undefined}><ActionForm action={peopleOperationsAction} submitLabel={r.publishedAt ? "Save correction" : "Save draft"}><Hidden values={{ kind: isReview ? "performanceEdit" : "warningEdit", id: r.id, revision: r.revision, employeeId }} /><RecordFields kind={kind} defaults={defaults} options={options} />{r.publishedAt && <Field label="Correction reason" name="correctionReason" required maxLength={500} />}</ActionForm></Dialog>}
          {!isReview && r.publishedAt && !revoked && "canPublish" in r && r.canPublish && <Dialog triggerSize="sm" variant="ghost" triggerClassName="text-danger hover:bg-danger-soft hover:text-danger" trigger="Revoke" title="Revoke notice" description="For notices issued in error. The record and its history are kept and marked revoked." size="sm"><ActionForm action={peopleOperationsAction} submitLabel="Revoke notice" confirmation={{ title: "Revoke this notice?", description: "It will be marked revoked for the employee and staff. This cannot be undone.", label: "Revoke", destructive: true }}><Hidden values={{ kind: "warningRevoke", id: r.id, revision: r.revision }} /><Field label="Revocation reason" name="reason" required maxLength={500} /></ActionForm></Dialog>}
          {options && employeeId && defaults.employeeId !== employeeId && !revoked && <Link className="link text-xs" href={`?employeeId=${String(defaults.employeeId)}`}>Filter to this employee to edit</Link>}
          {!options || !employeeId ? <Link className="link text-xs" href={`?employeeId=${String(defaults.employeeId)}`}>Open employee records</Link> : null}
        </div>}
      </CardContent></Card>;
  })}</div>;
}
export function RecordFilters({ options, kind, query }: { options: Options; kind: RecordKind; query: Record<string, string | undefined> }) {
  return <FilterBar resetHref={`/manage/${kind}`} columns={kind === "warnings" ? 5 : 4}>
    <SelectField label="Employee" name="employeeId" defaultValue={query.employeeId ?? ""}><option value="">All employees</option>{options.employees.map(e => <option key={e.id} value={e.id}>{e.legalName}</option>)}</SelectField>
    <SelectField label="Status" name="status" defaultValue={query.status ?? ""}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Finalized</option>{kind === "warnings" && <option value="REVOKED">Revoked</option>}</SelectField>
    <Field label="From" name="from" type="date" defaultValue={query.from} /><Field label="Before" name="until" type="date" defaultValue={query.until} hint="Exclusive end date." />
    {kind === "warnings" && <SelectField label="Severity" name="severity" defaultValue={query.severity ?? ""}><option value="">All severities</option>{severities.map(t => <option key={t} value={t}>{words(t)}</option>)}</SelectField>}
  </FilterBar>;
}
export function PageLinks({ page, hasNext, query }: { page: number; hasNext: boolean; query: Record<string, string | undefined> }) { return <Pagination page={page} hasNext={hasNext} query={query} />; }
