import { ClipboardCheck, Download } from "lucide-react";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownIncidents } from "@/features/people-operations/incidents";
import { incidentAction } from "@/features/people-operations/incident-actions";
import { organizationSummary } from "@/features/settings/service";
import { IncidentStatus, Severity, categoryLabel, actionLabel } from "@/components/people-operations/incidents";
import { Hidden } from "@/components/review/forms";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/description-list";
import { ActionForm } from "@/components/ui/action-form";
import { TextAreaField } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { displayInstant } from "@/features/time/dates";
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const identity = await getIdentity(), q = await searchParams;
  const [data, settings] = await Promise.all([pageResult(ownIncidents(identity, q.id)), pageResult(organizationSummary(identity))]), zone = settings.timezone;
  return <>
    <PageHeader title="Incident & performance records" description="Records about your work that HR has shared with you. Acknowledging a record confirms you received it — it does not mean you agree." />
    {!data.records.length ? <EmptyState icon={ClipboardCheck} title="No records shared with you" description="When HR shares an incident or a positive record with you, it appears here." /> :
    <div className="space-y-5">{data.records.map(r => {
      const ref = { id: r.id, revision: r.revision };
      return <Card key={r.id} id={r.id}><CardHeader actions={<div className="flex flex-wrap gap-1.5"><Severity severity={r.severity} /><IncidentStatus status={r.status} kind={r.kind} /></div>}>
        <CardTitle>{r.title}</CardTitle><CardDescription>{r.reference} · {categoryLabel(r.category)} · {r.occurredOn}</CardDescription></CardHeader>
        <CardContent className="space-y-4 text-sm">
          {r.status === "UNDER_REVIEW" && <Alert tone="info">This record is under review. It is not a confirmed finding.</Alert>}
          <div><p className="font-medium">What happened</p><p className="mt-1 whitespace-pre-wrap text-[#344054]">{r.description}</p></div>
          {r.impact && <div><p className="font-medium">Impact</p><p className="mt-1 whitespace-pre-wrap text-[#344054]">{r.impact}</p></div>}
          <DescriptionList items={[
            ...(r.reviewNote ? [["Review decision", r.reviewNote] as [string, string]] : []),
            ...(r.correctiveAction ? [["Agreed action", `${actionLabel(r.correctiveAction)}${r.correctiveNote ? ` — ${r.correctiveNote}` : ""}`] as [string, string], ["Follow-up", r.correctiveDone ? "Completed" : r.followUpOn ?? "—"] as [string, string]] : []),
            ...(r.resolution ? [[r.status === "CLOSED" ? "Closing note" : "Resolution", r.resolution] as [string, string]] : []),
          ]} />
          {r.evidence && <a className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary" href={`/api/me/documents/${r.evidence.id}`}><Download size={14} aria-hidden="true" />{r.evidence.displayName}</a>}
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            {r.acknowledgedAt ? <p className="text-muted-foreground">Receipt acknowledged {displayInstant(r.acknowledgedAt, zone)}.</p>
              : <ActionForm compact action={incidentAction} submitVariant="outline" submitLabel="Acknowledge receipt" confirmation={{ title: "Acknowledge receipt?", description: "This confirms you received the record. It does not mean you agree with it.", label: "Acknowledge" }}><Hidden values={{ ...ref, kind: "acknowledge" }} /></ActionForm>}
          </div>
          {r.respondedAt ? <div className={r.employeeDisputes ? "rounded-lg border border-[#fedf89] bg-warning-soft px-3 py-2" : "rounded-lg border bg-subtle px-3 py-2"}><p className="font-medium">{r.employeeDisputes ? "You dispute this record" : "Your response"}</p><p className="mt-1 whitespace-pre-wrap">{r.employeeResponse}</p><p className="mt-1 text-xs text-muted-foreground">{displayInstant(r.respondedAt, zone)} · kept with the record alongside HR’s decision</p></div>
            : r.responseRequested && <ActionForm action={incidentAction} submitLabel="Submit response" confirmation={{ title: "Submit your response?", description: "Your response is kept as written and cannot be edited afterwards.", label: "Submit response" }}><Hidden values={{ ...ref, kind: "respond" }} />
              <fieldset><legend className="mb-1.5 text-sm font-medium">Your position</legend><div className="flex flex-wrap gap-4"><label className="flex items-center gap-2"><input type="radio" name="position" value="ACCEPT" defaultChecked />I accept this record</label><label className="flex items-center gap-2"><input type="radio" name="position" value="DISPUTE" />I dispute this record</label></div></fieldset>
              <TextAreaField label="Your explanation or response" name="response" required rows={4} maxLength={2000} /></ActionForm>}
        </CardContent></Card>;
    })}</div>}
  </>;
}
