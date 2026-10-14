import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextAreaField, FieldGrid, FormSection } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Hidden } from "@/components/review/forms";
import { incidentAction } from "@/features/people-operations/incident-actions";
import type { LinkOptions } from "@/features/people-operations/incidents";
import { concernCategories, positiveCategories, incidentCategories, severities, incidentStatuses, correctiveActions } from "@/features/people-operations/incident-options";
import { dateKey } from "@/features/time/dates";
type Tone = "success" | "warning" | "danger" | "info" | "neutral";
const statusTone: Record<string, Tone> = { DRAFT: "neutral", UNDER_REVIEW: "info", CONFIRMED: "danger", DISPUTED: "warning", UNSUBSTANTIATED: "neutral", RESOLVED: "success", CLOSED: "neutral" };
const severityTone: Record<string, Tone> = { LOW: "neutral", MEDIUM: "info", HIGH: "warning", CRITICAL: "danger" };
export const categoryLabel = (c: string) => incidentCategories[c as keyof typeof incidentCategories] ?? c;
export const actionLabel = (a: string | null) => a ? correctiveActions[a as keyof typeof correctiveActions] ?? a : "—";
export function IncidentStatus({ status, kind }: { status: string; kind: string }) {
  return <StatusBadge status={status} label={incidentStatuses[status as keyof typeof incidentStatuses] ?? status} tone={kind === "POSITIVE" && status === "CONFIRMED" ? "success" : statusTone[status] ?? "neutral"} />;
}
export function Severity({ severity }: { severity: string | null }) {
  return severity ? <StatusBadge status={severity} label={severities[severity as keyof typeof severities]} tone={severityTone[severity]} /> : <span className="text-xs text-muted-foreground">Positive</span>;
}
type Record_ = { category?: string; title?: string; description?: string; impact?: string; severity?: string | null; occurredOn?: string; occurredAt?: Date | null; staffNotes?: string; relatedTaskId?: string | null; relatedSessionId?: string | null; relatedActivityId?: string | null; relatedWarningId?: string | null; relatedReviewId?: string | null; kind?: string };
const time = (d: Date | null | undefined, zone: string) => d ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(d) : "";
/** Form fields shared by create and edit. Only the employee, category, title, description, date and (for concerns) severity are required. */
export function IncidentFields({ record, options, timezone, today }: { record?: Record_; options?: LinkOptions; timezone: string; today: string }) {
  const positiveOnly = record?.kind === "POSITIVE", concernOnly = record?.kind === "CONCERN";
  return <div className="space-y-5">
    <FieldGrid>
      <SelectField label="Category" name="category" required defaultValue={record?.category ?? ""}><option value="">Choose a category</option>
        {!positiveOnly && <optgroup label="Concerns">{Object.entries(concernCategories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</optgroup>}
        {!concernOnly && <optgroup label="Positive records">{Object.entries(positiveCategories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</optgroup>}</SelectField>
      <SelectField label="Severity" name="severity" defaultValue={record?.severity ?? ""} hint="Potential impact of a concern — not a punishment. Leave empty for positive records."><option value="">None (positive record)</option>{Object.entries(severities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
    </FieldGrid>
    <Field label="Short title" name="title" required maxLength={150} defaultValue={record?.title} />
    <FieldGrid><Field label="Date" name="occurredOn" type="date" required max={today} defaultValue={record?.occurredOn ?? today} /><Field label="Time (optional)" name="occurredTime" type="time" defaultValue={time(record?.occurredAt, timezone)} hint={timezone} /></FieldGrid>
    <TextAreaField label="What happened (factual description)" name="description" required rows={4} maxLength={5000} defaultValue={record?.description} hint="Describe observable facts; avoid conclusions about intent." />
    <TextAreaField label="Impact or consequence (optional)" name="impact" rows={2} maxLength={2000} defaultValue={record?.impact} />
    <TextAreaField label="Internal notes (staff only)" name="staffNotes" rows={2} maxLength={2000} defaultValue={record?.staffNotes} hint="Never shown to the employee." />
    {options && <FormSection title="Related records (optional)"><FieldGrid>
      <SelectField label="Task" name="relatedTaskId" defaultValue={record?.relatedTaskId ?? ""}><option value="">None</option>{options.tasks.map(t => <option key={t.id} value={t.id}>{dateKey(t.assignedDate)} · {t.title}</option>)}</SelectField>
      <SelectField label="Attendance session" name="relatedSessionId" defaultValue={record?.relatedSessionId ?? ""}><option value="">None</option>{options.sessions.map(s => <option key={s.id} value={s.id}>{dateKey(s.workDate)} · {time(s.checkinAt, timezone)}–{s.checkoutAt ? time(s.checkoutAt, timezone) : "open"}</option>)}</SelectField>
      <SelectField label="Work record" name="relatedActivityId" defaultValue={record?.relatedActivityId ?? ""}><option value="">None</option>{options.activities.map(a => <option key={a.id} value={a.id}>{dateKey(a.eventTime)} · {a.title}</option>)}</SelectField>
      <SelectField label="Existing warning" name="relatedWarningId" defaultValue={record?.relatedWarningId ?? ""}><option value="">None</option>{options.warnings.map(w => <option key={w.id} value={w.id}>{dateKey(w.issueDate)} · {w.reason}</option>)}</SelectField>
      <SelectField label="Performance review" name="relatedReviewId" defaultValue={record?.relatedReviewId ?? ""}><option value="">None</option>{options.reviews.map(r => <option key={r.id} value={r.id}>{dateKey(r.startDate)} – {dateKey(r.endDate)}</option>)}</SelectField>
    </FieldGrid></FormSection>}
  </div>;
}
export function NewIncidentButton({ employees, employeeId, options, timezone, today }: { employees?: { id: string; legalName: string; employeeNumber: string }[]; employeeId?: string; options?: LinkOptions; timezone: string; today: string }) {
  return <Dialog variant="default" size="lg" trigger={<><Plus size={16} aria-hidden="true" />New record</>} title="New incident or performance record" description="Saved as a draft. Nothing is shared with the employee until you choose to, and no pay or status changes follow from a record.">
    <ActionForm action={incidentAction} submitLabel="Save draft"><Hidden values={{ kind: "create", ...(employeeId ? { employeeId } : {}) }} />
      {!employeeId && employees && <SelectField label="Employee" name="employeeId" required defaultValue=""><option value="">Choose employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.legalName} · {e.employeeNumber}</option>)}</SelectField>}
      <IncidentFields options={options} timezone={timezone} today={today} />
    </ActionForm></Dialog>;
}
type Row = { id: string; reference: string; employee?: { id: string; legalName: string; employeeNumber: string }; kind: string; category: string; title: string; severity: string | null; status: string; occurredOn: string; followUpOn: string | null; overdue: boolean; correctiveAction: string | null; correctiveDone: boolean; employeeVisible: boolean; responded: boolean; disputes: boolean | null; reportedBy: string };
export function IncidentTable({ records, showEmployee = true }: { records: Row[]; showEmployee?: boolean }) {
  if (!records.length) return <EmptyState icon={ClipboardCheck} title="No records match" description="Change the filters, or create a record." />;
  return <TableContainer label="Incident and performance records"><table className="data-table min-w-[900px]"><thead><tr><th>Reference</th>{showEmployee && <th>Employee</th>}<th>Date</th><th>Record</th><th>Severity</th><th>Status</th><th>Follow-up</th><th className="text-right">Action</th></tr></thead><tbody>{records.map(r => <tr key={r.id}>
    <td className="whitespace-nowrap font-mono text-xs">{r.reference}</td>
    {showEmployee && <td><Cell2 primary={r.employee?.legalName ?? "—"} secondary={r.employee?.employeeNumber} /></td>}
    <td className="whitespace-nowrap tabular-nums">{r.occurredOn}</td>
    <td><Cell2 primary={r.title} secondary={`${categoryLabel(r.category)} · reported by ${r.reportedBy}${r.employeeVisible ? " · shared with employee" : ""}${r.responded ? r.disputes ? " · employee disputes" : " · employee responded" : ""}`} /></td>
    <td><Severity severity={r.severity} /></td><td><IncidentStatus status={r.status} kind={r.kind} /></td>
    <td className="whitespace-nowrap text-[13px]">{r.correctiveAction ? r.correctiveDone ? <span className="text-success">Completed</span> : r.followUpOn ? <span className={r.overdue ? "font-medium text-danger" : undefined}>{r.overdue ? "Overdue · " : ""}{r.followUpOn}</span> : actionLabel(r.correctiveAction) : "—"}</td>
    <td className="text-right"><Link className="link text-sm" href={`/manage/incidents/${r.id}`}>Open<span className="sr-only"> {r.reference}</span></Link></td>
  </tr>)}</tbody></table></TableContainer>;
}
export function IncidentFilters({ query, resetHref, reporters, showSearch = true }: { query: Record<string, string>; resetHref: string; reporters?: { id: string; name: string }[]; showSearch?: boolean }) {
  return <FilterBar resetHref={resetHref} columns={4}>
    {showSearch && <Field label="Search" name="search" type="search" placeholder="Employee or INC-00012" defaultValue={query.search ?? ""} maxLength={150} />}
    <SelectField label="Category" name="category" defaultValue={query.category ?? ""}><option value="">All categories</option>{Object.entries(incidentCategories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
    <SelectField label="Severity" name="severity" defaultValue={query.severity ?? ""}><option value="">All severities</option>{Object.entries(severities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
    <SelectField label="Review status" name="status" defaultValue={query.status ?? ""}><option value="">All statuses</option>{Object.entries(incidentStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
    <SelectField label="Open or resolved" name="state" defaultValue={query.state ?? ""}><option value="">All</option><option value="OPEN">Open</option><option value="RESOLVED">Resolved or closed</option></SelectField>
    <Field label="From" name="from" type="date" defaultValue={query.from ?? ""} /><Field label="To" name="to" type="date" defaultValue={query.to ?? ""} />
    {reporters && <SelectField label="Reported by" name="reportedBy" defaultValue={query.reportedBy ?? ""}><option value="">Anyone</option>{reporters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectField>}
  </FilterBar>;
}
