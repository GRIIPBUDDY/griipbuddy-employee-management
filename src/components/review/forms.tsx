import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { correctionOptions } from "@/features/review/corrections";
import { CorrectionFields } from "./correction-fields";
import { DecisionForm } from "./decision-form";
import { Temporal } from "@js-temporal/polyfill";
import { randomUUID } from "node:crypto";
import { FilePenLine } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { TextAreaField } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DescriptionList } from "@/components/ui/description-list";
import { reviewAction } from "@/features/review/actions";
import { displayInstant, dateKey, minuteLabel } from "@/features/time/dates";
import type { correctionList } from "@/features/review/corrections";
export function Hidden({ values }: { values: Record<string, string | number> }) { return <>{Object.entries(values).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>; }
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const typeLabel: Record<string, string> = { ADD: "Missing session", REPLACE: "Change times", VOID: "Remove session" };
async function CorrectionBody({ employeeId, sessionId = "", workDate = "" }: { employeeId?: string; sessionId?: string; workDate?: string }) {
  const identity = await getIdentity(), options = await pageResult(correctionOptions(identity, employeeId, sessionId || undefined));
  const sessions = [...options.sessions], selected = sessions.find(s => s.id === sessionId), timezone = options.timezone;
  const local = (value: Date | null | undefined) => value ? Temporal.Instant.from(value.toISOString()).toZonedDateTimeISO(timezone).toPlainDateTime().toString() : "";
  return <ActionForm action={reviewAction} submitLabel="Submit correction request">
    <Hidden values={{ kind: "correction", operationKey: randomUUID(), ...(employeeId ? { employeeId } : {}) }} />
    <CorrectionFields initialSessionId={selected?.id ?? ""} initialWorkDate={workDate} sessions={sessions.map(s => ({ id: s.id, date: dateKey(s.workDate), label: `${dateKey(s.workDate)} · ${displayInstant(s.checkinAt, timezone)} → ${s.checkoutAt ? displayInstant(s.checkoutAt, timezone) : "missing checkout"}`, checkin: local(s.checkinAt), checkout: local(s.checkoutAt), slotId: s.scheduleSlotId ?? "" }))} periods={options.patterns.map(p => ({ label: `${p.label ?? "Weekly pattern"} · ${dateKey(p.effectiveFrom)} → ${p.effectiveUntil ? dateKey(p.effectiveUntil) : "ongoing"}`, slots: p.slots.map(s => ({ id: s.id, label: `${weekdays[s.weekday - 1]} · ${minuteLabel(s.startMinute)}–${minuteLabel(s.endMinute)}${s.endDayOffset ? " (+1 day)" : ""}` })) }))} timezone={timezone} />
    <TextAreaField name="reason" label="Explanation and supporting evidence" required maxLength={500} rows={3} />
  </ActionForm>;
}
/** Correction request form. `dialog` renders it behind a button; a preselected session opens it immediately. */
export async function CorrectionForm({ employeeId, sessionId = "", workDate = "", dialog = false }: { timezone?: string; employeeId?: string; sessionId?: string; workDate?: string; scheduleSlotId?: string; dialog?: boolean }) {
  const body = <CorrectionBody employeeId={employeeId} sessionId={sessionId} workDate={workDate} />;
  const description = "Times use the organization timezone. A request changes official attendance only after an authorized reviewer approves it.";
  if (dialog) return <Dialog variant="default" defaultOpen={!!sessionId} trigger={<><FilePenLine size={16} aria-hidden="true" />New correction request</>} title="Request an attendance correction" description={description} size="lg">{body}</Dialog>;
  return <Card><CardHeader><CardTitle>Request attendance correction</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{body}</CardContent></Card>;
}
export { DecisionForm } from "./decision-form";
export function CorrectionRequests({ data, staff, timezone }: { data: Awaited<ReturnType<typeof correctionList>>; staff: boolean; timezone: string }) {
  if (!data.records.length) return <EmptyState icon={FilePenLine} title="No correction requests" description={staff ? "Requests matching this view will appear here." : "Your submitted requests and their review status will appear here."} />;
  return <div className="space-y-3">{data.records.map(r => <Card key={r.id}><CardHeader actions={<StatusBadge status={r.status} />}>
    <CardTitle>{staff && r.employee ? `${r.employee.legalName} · ` : ""}{typeLabel[r.type] ?? r.type} · {dateKey(r.workDate)}</CardTitle><CardDescription>Submitted {displayInstant(r.createdAt, timezone)}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <p className="rounded-lg bg-subtle px-3 py-2 text-sm leading-6">{r.reason}</p>
      <DescriptionList columns={3} items={[["Recorded (original)", <OriginalTimes key="o" value={r.originalValues} timezone={timezone} />], ["Requested", r.type === "VOID" ? "Remove the session" : `${r.proposedCheckinAt ? displayInstant(r.proposedCheckinAt, timezone) : "—"} → ${r.proposedCheckoutAt ? displayInstant(r.proposedCheckoutAt, timezone) : "—"}`], ["Assigned period", r.relatedSchedule ? `${weekdays[r.relatedSchedule.weekday - 1]} ${minuteLabel(r.relatedSchedule.startMinute)}–${minuteLabel(r.relatedSchedule.endMinute)}${r.relatedSchedule.endDayOffset ? " (+1 day)" : ""}` : "Unscheduled work"]]} />
      {(r.reviewComment || r.reviewedAt) && <p className="text-sm text-muted-foreground">Reviewed {r.reviewedAt ? displayInstant(r.reviewedAt, timezone) : ""} by {r.reviewerName ?? "authorized reviewer"}{r.reviewComment ? ` — “${r.reviewComment}”` : ""}</p>}
      {r.status === "PENDING" && <div className="flex flex-wrap gap-2">{staff ? r.canDecide ? <Dialog variant="default" triggerSize="sm" trigger="Review request" title="Review attendance correction" description={`${r.employee?.legalName ?? ""} · ${typeLabel[r.type] ?? r.type} · ${dateKey(r.workDate)}`}><DecisionForm kind="correctionDecision" id={r.id} /></Dialog> : <p className="text-sm text-muted-foreground">An administrator must review your own request.</p>
        : <ActionForm compact action={reviewAction} submitVariant="outline" submitSize="sm" submitLabel="Withdraw request" confirmation={{ title: "Withdraw this request?", description: "It will be withdrawn and kept in your history.", label: "Withdraw", destructive: true }}><Hidden values={{ kind: "correctionWithdraw", id: r.id }} /></ActionForm>}</div>}
    </CardContent></Card>)}</div>;
}
function OriginalTimes({ value, timezone }: { value: unknown; timezone: string }) {
  const original = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const show = (key: string) => typeof original[key] === "string" && Number.isFinite(new Date(original[key] as string).getTime()) ? displayInstant(new Date(original[key] as string), timezone) : null;
  return <span className="font-normal">{show("checkinAt") ? `${show("checkinAt")} → ${show("checkoutAt") ?? "missing checkout"}` : "No recorded session"}</span>;
}
