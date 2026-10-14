import Link from "next/link";
import { Download } from "lucide-react";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { incidentDetail } from "@/features/people-operations/incidents";
import { incidentAction } from "@/features/people-operations/incident-actions";
import { incidentStatuses, correctiveActions } from "@/features/people-operations/incident-options";
import { IncidentFields, IncidentStatus, Severity, categoryLabel, actionLabel } from "@/components/people-operations/incidents";
import { EvidenceUpload } from "@/components/people-operations/incident-evidence";
import { Hidden } from "@/components/review/forms";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/description-list";
import { ActionForm } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { Field, SelectField, TextAreaField, CheckboxField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { displayInstant } from "@/features/time/dates";
const actions: Record<string, string> = { INCIDENT_CREATED: "Record created", INCIDENT_EDITED: "Details edited", INCIDENT_SUBMITTED: "Submitted for review", INCIDENT_REVIEWED: "Review decision", CORRECTIVE_ACTION_RECORDED: "Corrective action recorded", FOLLOW_UP_COMPLETED: "Follow-up completed", INCIDENT_RESOLVED: "Resolved", INCIDENT_CLOSED: "Closed", INCIDENT_REOPENED: "Reopened", INCIDENT_VISIBILITY_CHANGED: "Employee access changed", INCIDENT_EVIDENCE_ATTACHED: "Evidence attached", INCIDENT_EVIDENCE_REMOVED: "Evidence removed", INCIDENT_ACKNOWLEDGED: "Employee acknowledged receipt", INCIDENT_RESPONSE_SUBMITTED: "Employee response submitted" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getIdentity(), data = await pageResult(incidentDetail(identity, (await params).id)), r = data.record, zone = data.timezone, positive = r.kind === "POSITIVE";
  const ref = { kind: "", id: r.id, revision: r.revision }, open = ["DRAFT", "UNDER_REVIEW"].includes(r.status), decided = ["CONFIRMED", "DISPUTED", "UNSUBSTANTIATED"].includes(r.status), finished = ["RESOLVED", "CLOSED"].includes(r.status);
  const at = (d: Date | null) => d ? displayInstant(d, zone) : "—", who = (id: string | null) => id ? data.names[id] ?? "Staff" : "—";
  const docUrl = (id: string) => `/api/employees/${r.employeeId}/documents/${id}`;
  // The current decision survives resolution in the history; reopening clears it from the record but not from the history.
  const lastDecision = r.reviewedAt ? String(data.history.filter(h => h.action === "INCIDENT_REVIEWED").at(-1)?.after?.status ?? "") : "";
  return <>
    <PageHeader breadcrumbs={[{ label: "Incidents & performance", href: "/manage/incidents" }, { label: r.reference }]} title={`${r.reference} · ${r.title}`}
      description={<><Link className="link" href={`/manage/employees/${data.employee.id}/incidents`}>{data.employee.legalName}</Link> · {categoryLabel(r.category)} · {r.occurredOn}{r.occurredAt ? ` ${at(r.occurredAt).split(", ").at(-1)}` : ""}</>}
      actions={<div className="flex flex-wrap items-center gap-2"><Severity severity={r.severity} /><IncidentStatus status={r.status} kind={r.kind} /></div>} />
    {r.status === "UNDER_REVIEW" && <Alert tone="info" title="Awaiting review">This record is not a confirmed fault until a reviewer records a decision.</Alert>}
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Card><CardHeader actions={open && <Dialog size="lg" trigger="Edit details" title={`Edit ${r.reference}`} description="Details can change while the record is a draft or under review; every change is audited."><ActionForm action={incidentAction} submitLabel="Save changes"><Hidden values={{ ...ref, kind: "edit" }} /><IncidentFields record={{ ...r, occurredOn: r.occurredOn }} options={data.options} timezone={zone} today={data.today} />{r.status === "UNDER_REVIEW" && <Field label="Reason for the change" name="reason" maxLength={500} />}</ActionForm></Dialog>}><CardTitle>Record</CardTitle><CardDescription>Reported by {who(r.reportedBy)} · created {at(r.createdAt)}</CardDescription></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div><p className="font-medium">What happened</p><p className="mt-1 whitespace-pre-wrap text-[#344054]">{r.description}</p></div>
            {r.impact && <div><p className="font-medium">Impact or consequence</p><p className="mt-1 whitespace-pre-wrap text-[#344054]">{r.impact}</p></div>}
            {r.staffNotes && <div className="rounded-lg border border-dashed bg-subtle px-3 py-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal notes · staff only</p><p className="mt-1 whitespace-pre-wrap">{r.staffNotes}</p></div>}
            {(data.related.task || data.related.session || data.related.activity || data.related.warning || data.related.review) && <DescriptionList items={[
              ...(data.related.task ? [["Task", data.related.task.title] as [string, string]] : []),
              ...(data.related.session ? [["Attendance session", `${data.related.session.workDate.toISOString().slice(0, 10)} · ${at(data.related.session.checkinAt)}`] as [string, string]] : []),
              ...(data.related.activity ? [["Work record", data.related.activity.title] as [string, string]] : []),
              ...(data.related.warning ? [["Warning", <Link key="w" className="link" href={`/manage/warnings?id=${data.related.warning.id}`}>{data.related.warning.reason}</Link>] as [string, React.ReactNode]] : []),
              ...(data.related.review ? [["Performance review", <Link key="p" className="link" href={`/manage/performance?id=${data.related.review.id}`}>{data.related.review.startDate.toISOString().slice(0, 10)} – {data.related.review.endDate.toISOString().slice(0, 10)}</Link>] as [string, React.ReactNode]] : []),
            ]} />}
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Review</CardTitle><CardDescription>Draft → under review → confirmed, disputed or unsubstantiated → resolved or closed. Reopening keeps the earlier decision in the history.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {r.reviewedAt && lastDecision && <DescriptionList items={[["Decision", incidentStatuses[lastDecision as keyof typeof incidentStatuses] ?? lastDecision], ["Reviewed by", `${who(r.reviewedBy)} · ${at(r.reviewedAt)}`], ["Decision note", r.reviewNote ?? "—"]]} />}
            {finished && <DescriptionList items={[[r.status === "RESOLVED" ? "Resolution" : "Closing note", r.resolution ?? "—"], ["By", `${who(r.resolvedBy)} · ${at(r.resolvedAt)}`]]} />}
            <div className="flex flex-wrap gap-2">
              {r.status === "DRAFT" && <ActionForm compact action={incidentAction} submitLabel="Submit for review" confirmation={{ title: "Submit for review?", description: "The details stay editable during review. The employee is not informed unless you share the record.", label: "Submit" }}><Hidden values={{ ...ref, kind: "submit" }} /></ActionForm>}
              {open && <Dialog variant="default" trigger="Record decision" title="Review decision" description="Record what the evidence shows. Severity and a decision never trigger pay or status changes on their own."><ActionForm action={incidentAction} submitLabel="Save decision" confirmation={{ title: "Record this decision?", description: "The decision is kept in the record's history. Reopen the record if it must change later.", label: "Save decision" }}><Hidden values={{ ...ref, kind: "decide" }} />
                <SelectField label="Decision" name="decision" required defaultValue="CONFIRMED"><option value="CONFIRMED">Confirmed</option>{!positive && <option value="DISPUTED">Disputed</option>}<option value="UNSUBSTANTIATED">Unsubstantiated</option></SelectField>
                <TextAreaField label="Decision note" name="note" required rows={3} maxLength={2000} hint="Shown to the employee if the record is shared with them." /></ActionForm></Dialog>}
              {decided && <Dialog trigger="Resolve" title="Resolve this record" description="Summarise the outcome."><ActionForm action={incidentAction} submitLabel="Resolve record"><Hidden values={{ ...ref, kind: "resolve", outcome: "RESOLVED" }} /><TextAreaField label="Resolution" name="note" required rows={3} maxLength={2000} /></ActionForm></Dialog>}
              {!finished && <Dialog trigger="Close" title="Close this record" description="Close without further action, for example a duplicate or a record that needs no follow-up."><ActionForm action={incidentAction} submitLabel="Close record" confirmation={{ title: "Close this record?", description: "It stays in the history and can be reopened.", label: "Close record" }}><Hidden values={{ ...ref, kind: "resolve", outcome: "CLOSED" }} /><TextAreaField label="Closing note" name="note" required rows={2} maxLength={2000} /></ActionForm></Dialog>}
              {(decided || finished) && <Dialog trigger="Reopen" title="Reopen for review" description="Use only when genuinely necessary — for example new evidence. The current decision and resolution stay in the audit history."><ActionForm action={incidentAction} submitLabel="Reopen record" confirmation={{ title: "Reopen this record?", description: "The record returns to review and the reopening is audited.", label: "Reopen" }}><Hidden values={{ ...ref, kind: "reopen" }} /><TextAreaField label="Why reopen?" name="note" required rows={2} maxLength={2000} /></ActionForm></Dialog>}
            </div>
          </CardContent></Card>
        {!positive && <Card><CardHeader><CardTitle>Corrective action & follow-up</CardTitle><CardDescription>Recorded for follow-up only. No fine, deduction, commission change or suspension happens automatically — those need their own authorized process.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {r.correctiveAction ? <DescriptionList items={[["Action", actionLabel(r.correctiveAction)], ["Follow-up date", r.followUpOn ? `${r.followUpOn}${r.overdue ? " · overdue" : ""}` : "—"], ["Details", r.correctiveNote ?? "—"], ["Completed", r.correctiveCompletedAt ? `${who(r.correctiveCompletedBy)} · ${at(r.correctiveCompletedAt)}${r.completionNote ? ` — ${r.completionNote}` : ""}` : "Not yet"]]} /> : <p className="text-sm text-muted-foreground">No corrective action recorded.</p>}
            {r.overdue && <Alert tone="warning">The follow-up date has passed and the action is not marked complete.</Alert>}
            <div className="flex flex-wrap gap-2">
              {["UNDER_REVIEW", "CONFIRMED", "DISPUTED"].includes(r.status) && !r.correctiveCompletedAt && <Dialog trigger={r.correctiveAction ? "Update action" : "Record corrective action"} title="Corrective action"><ActionForm action={incidentAction} submitLabel="Save action"><Hidden values={{ ...ref, kind: "corrective" }} />
                <SelectField label="Action" name="action" required defaultValue={r.correctiveAction ?? "COACHING"}>{Object.entries(correctiveActions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
                <TextAreaField label="Details (optional)" name="note" rows={2} maxLength={2000} defaultValue={r.correctiveNote ?? ""} />
                <Field label="Follow-up date (optional)" name="followUpOn" type="date" min={r.occurredOn} defaultValue={r.followUpOn ?? ""} />
                <SelectField label="Link an existing warning (optional)" name="relatedWarningId" defaultValue={r.relatedWarningId ?? ""} hint="A formal warning is issued separately under Warnings; it is never created automatically."><option value="">None</option>{data.options.warnings.map(w => <option key={w.id} value={w.id}>{w.issueDate.toISOString().slice(0, 10)} · {w.reason}</option>)}</SelectField>
              </ActionForm></Dialog>}
              {r.correctiveAction && !r.correctiveCompletedAt && <Dialog trigger="Mark follow-up complete" title="Complete the corrective action"><ActionForm action={incidentAction} submitLabel="Mark complete"><Hidden values={{ ...ref, kind: "complete" }} /><TextAreaField label="Completion note (optional)" name="note" rows={2} maxLength={2000} /></ActionForm></Dialog>}
            </div>
          </CardContent></Card>}
      </div>
      <div className="space-y-5">
        <Card><CardHeader><CardTitle>Employee access</CardTitle><CardDescription>Employees see only records you share, never internal notes, the reporter or this history.</CardDescription></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <DescriptionList columns={1} items={[["Shared with employee", r.employeeVisible ? "Yes" : "No"], ["Response invited", r.responseRequested ? "Yes" : "No"], ["Receipt acknowledged", r.acknowledgedAt ? `${at(r.acknowledgedAt)} (does not imply agreement)` : "Not yet"]]} />
            {r.status !== "DRAFT" ? <ActionForm action={incidentAction} submitLabel="Save access" confirmation={{ title: "Change employee access?", description: "Sharing notifies the employee. The change is audited.", label: "Save access" }}><Hidden values={{ ...ref, kind: "visibility" }} />
              <CheckboxField name="employeeVisible" label="Share with the employee" defaultChecked={r.employeeVisible} />
              <CheckboxField name="responseRequested" label="Invite the employee's response" defaultChecked={r.responseRequested} description="They can respond once; the response is kept as submitted." /></ActionForm>
              : <p className="text-muted-foreground">Submit the draft for review before sharing it.</p>}
            {r.respondedAt && <div className={r.employeeDisputes ? "rounded-lg border border-[#fedf89] bg-warning-soft px-3 py-2" : "rounded-lg border bg-subtle px-3 py-2"}><p className="font-medium">{r.employeeDisputes ? "Employee disputes this record" : "Employee response"}</p><p className="mt-1 whitespace-pre-wrap">{r.employeeResponse}</p><p className="mt-1 text-xs text-muted-foreground">{at(r.respondedAt)}</p></div>}
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Evidence</CardTitle><CardDescription>Private documents. Downloads always check permission; nothing is public.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {data.evidence ? <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"><span className="min-w-0 truncate">{data.evidence.displayName}</span><span className="flex shrink-0 gap-1"><a className="inline-flex items-center gap-1 text-[13px] font-medium text-primary" href={docUrl(data.evidence.id)}><Download size={14} aria-hidden="true" />Download</a></span></div> : <p className="text-sm text-muted-foreground">No evidence attached.</p>}
            {!finished && <><EvidenceUpload id={r.id} revision={r.revision} />
              <ActionForm action={incidentAction} submitLabel={data.evidence ? "Change linked document" : "Link existing document"} submitVariant="outline"><Hidden values={{ ...ref, kind: "evidence" }} /><SelectField label="Or use an existing private document" name="documentId" defaultValue={data.evidence?.id ?? ""}><option value="">No evidence</option>{data.options.documents.map(d => <option key={d.id} value={d.id}>{d.displayName}</option>)}</SelectField></ActionForm></>}
          </CardContent></Card>
        <Card><CardHeader><CardTitle>History</CardTitle><CardDescription>From the audit log. It cannot be edited or deleted.</CardDescription></CardHeader>
          <CardContent><ol className="space-y-3 text-sm">{data.history.map(h => <li key={h.id} className="border-l-2 pl-3"><p className="font-medium">{actions[h.action] ?? h.action}{h.action === "INCIDENT_REVIEWED" && h.after?.status ? `: ${incidentStatuses[String(h.after.status) as keyof typeof incidentStatuses]}` : ""}</p><p className="text-xs text-muted-foreground">{h.by} · {at(h.at)}</p>{h.reason && <p className="mt-0.5 text-[13px] text-[#344054]">“{h.reason}”</p>}</li>)}</ol></CardContent></Card>
      </div>
    </div>
  </>;
}
