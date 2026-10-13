import { randomUUID } from "node:crypto";
import { ArrowLeftRight, Plus } from "lucide-react";
import { swapData, swapOptions } from "@/features/time/swaps";
import { swapAction } from "@/features/time/swap-actions";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextAreaField } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { dateKey, displayTime } from "@/features/time/dates";
type Options = Awaited<ReturnType<typeof swapOptions>>;
const day = (date: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
export function RequestSwapButton({ options, timezone }: { options: Options; timezone: string }) {
  const label = (o: Options[number]) => `${day(o.date)} · ${displayTime(o.start, timezone)}–${displayTime(o.end, timezone)}`;
  const own = options.filter(o => o.own), partner = options.filter(o => !o.own);
  return <Dialog variant="default" trigger={<><Plus size={16} aria-hidden="true" />Request swap</>} title="Request a shift swap" description={`Swap one of your future periods with a colleague’s (next 4 weeks, ${timezone}). Your colleague must accept, then HR approves.`}>
    {!own.length ? <Alert tone="neutral">You have no future scheduled periods in the next four weeks.</Alert> : <ActionForm action={swapAction} submitLabel="Send to colleague"><input type="hidden" name="kind" value="request" /><input type="hidden" name="operationKey" value={randomUUID()} />
      <SelectField label="Your period" name="own" required><option value="">Choose your period</option>{own.map(o => <option key={`${o.slotId}${o.date}`} value={`${o.slotId}|${o.date}`}>{label(o)}</option>)}</SelectField>
      <SelectField label="Colleague’s period" name="partner" required><option value="">Choose a colleague’s period</option>{[...new Set(partner.map(o => o.name))].map(name => <optgroup key={name} label={name}>{partner.filter(o => o.name === name).map(o => <option key={`${o.slotId}${o.date}`} value={`${o.employeeId}|${o.slotId}|${o.date}`}>{label(o)}</option>)}</optgroup>)}</SelectField>
      <TextAreaField label="Reason" name="reason" required maxLength={500} rows={2} /></ActionForm>}
  </Dialog>;
}
export function Swaps({ data, staff = false }: { data: Awaited<ReturnType<typeof swapData>>; staff?: boolean }) {
  if (!data.records.length) return <EmptyState icon={ArrowLeftRight} title="No shift swap requests" description={staff ? "Requests accepted by both employees will wait here for approval." : "Request a swap with a colleague for a future period."} />;
  return <TableContainer label="Shift swap requests"><table className="data-table min-w-[820px]"><thead><tr><th>Requester</th><th>Colleague</th><th>Reason</th><th>Status</th><th className="text-right">Actions</th></tr></thead><tbody>{data.records.map(r => <tr key={r.id}>
    <td><Cell2 primary={r.requester.legalName} secondary={`Gives up ${dateKey(r.requesterDate)}`} /></td><td><Cell2 primary={r.partner.legalName} secondary={`Gives up ${dateKey(r.partnerDate)}`} /></td>
    <td className="max-w-72 text-[13px]"><span className="line-clamp-2">{r.reason}</span>{r.partnerComment && <span className="block text-xs text-muted-foreground">Colleague: {r.partnerComment}</span>}</td>
    <td><StatusBadge status={r.status === "AWAITING_PARTNER" ? "AWAITING_PARTNER" : r.status} label={r.status === "ACCEPTED" ? "Awaiting HR approval" : undefined} /></td>
    <td><div className="flex justify-end gap-1">
      {!staff && data.operational && r.partnerEmployeeId === data.employeeId && r.status === "AWAITING_PARTNER" && <Dialog triggerSize="sm" variant="default" trigger="Respond" title="Respond to swap request" description={`${r.requester.legalName} asks to swap ${dateKey(r.requesterDate)} for your ${dateKey(r.partnerDate)}.`} size="sm"><ActionForm action={swapAction} submitLabel="Send response"><input type="hidden" name="kind" value="consent" /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="revision" value={r.revision} /><SelectField label="Your answer" name="accept"><option value="true">Accept and send to HR</option><option value="false">Decline</option></SelectField><Field name="comment" label="Comment" maxLength={500} /></ActionForm></Dialog>}
      {staff && ["AWAITING_PARTNER", "ACCEPTED"].includes(r.status) && <Dialog triggerSize="sm" variant={r.status === "ACCEPTED" ? "default" : "ghost"} trigger={r.status === "ACCEPTED" ? "Review" : "Reject"} title="Review shift swap" description={`${r.requester.legalName} (${dateKey(r.requesterDate)}) ↔ ${r.partner.legalName} (${dateKey(r.partnerDate)}). Approval exchanges both periods atomically; history and attendance stay unchanged.`} size="sm"><ActionForm action={swapAction} submitLabel="Save decision" confirmation={{ title: "Record this swap decision?", description: "Approval publishes both one-day schedule changes together. Rejection keeps both schedules as they are.", label: "Confirm" }}><input type="hidden" name="kind" value="review" /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="revision" value={r.revision} /><SelectField label="Decision" name="approve">{r.status === "ACCEPTED" && <option value="true">Approve the exchange</option>}<option value="false">Reject</option></SelectField><Field label="Reason" name="comment" required maxLength={500} /></ActionForm></Dialog>}
    </div></td></tr>)}</tbody></table></TableContainer>;
}
