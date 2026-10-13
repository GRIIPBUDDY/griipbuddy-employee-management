import { CalendarPlus, CalendarCog } from "lucide-react";
import { ScheduleActionForm } from "./schedule-action-form";
import { Field, SelectField, CheckboxField } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { ScheduleFields } from "./schedule-fields";
import { addDays, dateKey, minuteLabel } from "@/features/time/dates";
import type { employeeSchedule } from "@/features/time/data";
import type { employeeProfile } from "@/features/people/data";
type Data = Awaited<ReturnType<typeof employeeSchedule>>;
type Version = Data["versions"][number];
const short = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function versionState(v: Version, today: string) {
  const from = dateKey(v.effectiveFrom), until = v.effectiveUntil ? dateKey(v.effectiveUntil) : null;
  return v.supersededAt ? "SUPERSEDED" : until && until <= today ? "ENDED" : from > today ? "SCHEDULED" : "ACTIVE";
}
export function patternSummary(slots: Version["slots"]) {
  if (!slots.length) return "Rest pattern · no work";
  const minutes = slots.reduce((sum, s) => sum + s.endMinute + s.endDayOffset * 1440 - s.startMinute, 0), days = [...new Set(slots.map(s => s.weekday))].sort();
  const times = [...new Set(slots.map(s => `${minuteLabel(s.startMinute)}–${minuteLabel(s.endMinute)}${s.endDayOffset ? "+1" : ""}`))];
  return `${days.map(d => short[d - 1]).join(", ")} · ${times.slice(0, 3).join(", ")}${times.length > 3 ? "…" : ""} · ${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}/week`;
}
function HolidayWork() { return <CheckboxField name="holidayWorkRequired" label="Require work on company holidays" description="Only for a bounded temporary assignment with an explicit reason." />; }
function replacementForm(v: Version, data: Data, profileId: string) {
  const from = dateKey(v.effectiveFrom), until = v.effectiveUntil ? dateKey(v.effectiveUntil) : "", tomorrow = addDays(data.today, 1);
  const slots = v.slots.map(({ weekday, startMinute, endMinute, endDayOffset }) => ({ weekday, startMinute, endMinute, endDayOffset }));
  return <ScheduleActionForm key={`${v.id}:${v.revision}`} from={from > tomorrow ? from : tomorrow} until={until} baseFrom={from} baseUntil={until} timezone={data.timezone} submitLabel="Publish schedule change" headerFields={<><input type="hidden" name="employeeId" value={profileId} /><input type="hidden" name="employmentPeriodId" value={v.employmentPeriodId} /><input type="hidden" name="baseScheduleId" value={v.id} /><input type="hidden" name="baseRevision" value={v.revision} /><input type="hidden" name="restoreSlots" value={JSON.stringify(slots)} /></>}>
    <Field label="Schedule label" name="label" defaultValue={v.label ?? ""} maxLength={100} hint="Optional, e.g. “Split shift”." /><ScheduleFields initial={slots} />
    <CheckboxField name="restorePrevious" label="Restore the current pattern after a bounded change" description="Required when the change has an end date before the current assignment ends. One-day overrides restore it automatically." />
    <HolidayWork /><Field label="Reason for the change" name="reason" required maxLength={500} />
  </ScheduleActionForm>;
}
export function ScheduleManagement({ data, profile }: { data: Data; profile: Awaited<ReturnType<typeof employeeProfile>> }) {
  const tomorrow = addDays(data.today, 1);
  const replaceable = (v: Version) => !v.supersededAt && (!v.effectiveUntil || dateKey(v.effectiveUntil) > tomorrow);
  const current = data.versions.find(v => versionState(v, data.today) === "ACTIVE") ?? data.versions.filter(v => versionState(v, data.today) === "SCHEDULED").sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())[0];
  const createForm = <ScheduleActionForm key={`create:${profile.id}`} from={data.today} timezone={data.timezone} submitLabel="Publish schedule" headerFields={<><input type="hidden" name="employeeId" value={profile.id} /><SelectField label="Employment record" name="employmentPeriodId" required>{profile.employmentPeriods.map(p => <option key={p.id} value={p.id}>{dateKey(p.startDate)} – {p.endDate ? dateKey(p.endDate) : "Ongoing"} · {p.departmentLabel}</option>)}</SelectField></>}>
    {current && <Alert tone="info">This employee already has a schedule. Use this only for dates with no assignment (for example after a bounded assignment ends). To change the current schedule, use “Change schedule”.</Alert>}
    <Field label="Schedule label" name="label" maxLength={100} hint="Optional, e.g. “Split shift”." /><ScheduleFields /><HolidayWork /><Field label="Reason" name="reason" required maxLength={500} placeholder="e.g. Weekly work hours" />
  </ScheduleActionForm>;
  const createDialog = (primary: boolean) => <Dialog key="create" sheet variant={primary ? "default" : "outline"} trigger={<><CalendarPlus size={16} aria-hidden="true" />{primary ? "Publish schedule" : "New separate assignment"}</>} title="Publish a recurring schedule" description="Weekly work periods that repeat from the start date. Multiple periods per day are supported.">{createForm}</Dialog>;
  return <Card id="assignment-history">
    <CardHeader actions={<>{current && replaceable(current) ? <><Dialog key="change" sheet variant="default" trigger={<><CalendarCog size={16} aria-hidden="true" />Change schedule</>} title="Change the schedule" description={`Current: ${current.label ?? "Weekly pattern"} · ${patternSummary(current.slots)}. Changes start tomorrow or later; earlier dates and recorded attendance are kept.`}>{replacementForm(current, data, profile.id)}</Dialog>{createDialog(false)}</> : createDialog(true)}</>}>
      <CardTitle>Schedule assignments</CardTitle><CardDescription>Published assignments are never overwritten. Changes create a new version from a chosen date.</CardDescription>
    </CardHeader>
    <CardContent>{data.versions.length === 0 ? <EmptyState title="No schedule yet" description="Publish a recurring weekly schedule. The default pattern is 4 hours work, 4 hours break and 4 hours work." /> :
      <TableContainer label="Schedule assignments" flush className="rounded-lg border"><table className="data-table min-w-[760px]"><thead><tr><th>Assignment</th><th>Effective dates</th><th>Weekly pattern</th><th>Status</th><th className="text-right">Actions</th></tr></thead><tbody>{data.versions.map(v => {
        const from = dateKey(v.effectiveFrom), until = v.effectiveUntil ? dateKey(v.effectiveUntil) : null, state = versionState(v, data.today);
        return <tr key={v.id}><td><p className="font-medium">{v.label ?? "Weekly pattern"}</p><p className="mt-0.5 max-w-64 truncate text-xs text-muted-foreground" title={v.changeReason}>{v.changeReason}</p></td>
          <td className="whitespace-nowrap tabular-nums">{from} → {until ? addDays(until, -1) : "ongoing"}</td><td className="text-[13px]">{patternSummary(v.slots)}</td>
          <td><StatusBadge status={state} tone={state === "ACTIVE" ? "success" : state === "SCHEDULED" ? "info" : "neutral"} /></td>
          <td className="text-right">{replaceable(v) ? <Dialog sheet triggerSize="sm" variant="ghost" trigger="Change dates" title="Change or cancel future dates" description={`${v.label ?? "Weekly pattern"} · ${from} → ${until ? addDays(until, -1) : "ongoing"}. Remove all periods to cancel work for the chosen dates.`}>{replacementForm(v, data, profile.id)}</Dialog> : <span className="text-xs text-muted-foreground">Read only</span>}</td></tr>;
      })}</tbody></table></TableContainer>}
      {data.versions.length === 100 && <p className="mt-3 text-sm text-muted-foreground">Showing the latest 100 assignment versions.</p>}
    </CardContent>
  </Card>;
}
