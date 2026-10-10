import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ScheduleFields } from "./schedule-fields";
import { publishAction } from "@/features/time/actions";
import { addDays, dateKey, minuteLabel } from "@/features/time/dates";
import type { employeeSchedule } from "@/features/time/data";
import type { employeeProfile } from "@/features/people/data";
type Data = Awaited<ReturnType<typeof employeeSchedule>>;
export function ScheduleManagement({ data, profile }: { data: Data; profile: Awaited<ReturnType<typeof employeeProfile>> }) {
  const tomorrow = addDays(data.today, 1), weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return <><Card><CardHeader><CardTitle>Create schedule assignment</CardTitle><CardDescription>Dates apply to the scheduled period’s start date. The effective end is exclusive. Use a future replacement below when an assignment already covers these dates.</CardDescription></CardHeader><CardContent><ActionForm action={publishAction} submitLabel="Publish schedule">
    <input type="hidden" name="employeeId" value={profile.id} /><SelectField label="Employment period" name="employmentPeriodId" required>{profile.employmentPeriods.map(p => <option key={p.id} value={p.id}>{dateKey(p.startDate)} – {p.endDate ? dateKey(p.endDate) : "Ongoing"} · {p.departmentLabel}</option>)}</SelectField>
    <DateFields from={data.today} /><Field label="Schedule label (optional)" name="label" maxLength={100} /><ScheduleFields /><HolidayWork /><Field label="Reason for assignment" name="reason" required maxLength={500} />
  </ActionForm></CardContent></Card>
  <Card><CardHeader><CardTitle>Assignment history and future replacements</CardTitle><CardDescription>Published periods are retained. Replace from tomorrow or later, or remove all periods to publish a rest pattern. Temporary changes require explicit confirmation of the pattern to restore.</CardDescription></CardHeader><CardContent className="space-y-4">
    {data.versions.map(v => {
      const from = dateKey(v.effectiveFrom), until = v.effectiveUntil ? dateKey(v.effectiveUntil) : "";
      const canReplace = !v.supersededAt && (!until || until > tomorrow);
      const slots = v.slots.map(({ weekday, startMinute, endMinute, endDayOffset }) => ({ weekday, startMinute, endMinute, endDayOffset }));
      return <article key={v.id} className="space-y-3 rounded-lg border p-4"><h3 className="font-medium">{v.label ?? "Weekly pattern"} · {from} – {until || "Ongoing"}{v.supersededAt ? " · Superseded" : ""}</h3><p className="text-sm text-muted-foreground">{v.changeReason}</p><ul className="space-y-1 text-sm">{v.slots.map(s => <li key={s.id}>{weekdays[s.weekday - 1]} · {minuteLabel(s.startMinute)}–{minuteLabel(s.endMinute)}{s.endDayOffset ? " (+1 day)" : ""}</li>)}{v.slots.length === 0 && <li>Rest pattern · no scheduled work</li>}</ul>
      {canReplace && <details className="pt-2"><summary className="cursor-pointer text-sm font-medium text-blue-700">Replace or cancel future dates</summary><div className="pt-4"><ActionForm action={publishAction} submitLabel="Publish future replacement">
        <input type="hidden" name="employeeId" value={profile.id} /><input type="hidden" name="employmentPeriodId" value={v.employmentPeriodId} /><input type="hidden" name="baseScheduleId" value={v.id} /><input type="hidden" name="baseRevision" value={v.revision} /><input type="hidden" name="restoreSlots" value={JSON.stringify(slots)} />
        <DateFields from={from > tomorrow ? from : tomorrow} until={until} min={tomorrow} /><Field label="Schedule label (optional)" name="label" defaultValue={v.label ?? ""} maxLength={100} /><ScheduleFields initial={slots} /><HolidayWork />
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="restorePrevious" className="mt-1" />Restore this displayed weekly pattern after the temporary effective end. Required when replacing only part of this assignment.</label><Field label="Reason for replacement or cancellation" name="reason" required maxLength={500} />
      </ActionForm></div></details>}</article>;
    })}{data.versions.length === 0 && <p className="text-sm text-muted-foreground">No schedule assignments yet.</p>}{data.versions.length === 100 && <p className="text-sm text-muted-foreground">Showing the latest 100 assignment versions.</p>}
  </CardContent></Card></>;
}
function DateFields({ from, until = "", min }: { from: string; until?: string; min?: string }) { return <div className="grid gap-4 sm:grid-cols-2"><Field label="Effective start" name="effectiveFrom" type="date" required defaultValue={from} min={min} /><Field label="Effective end (exclusive, optional)" name="effectiveUntil" type="date" defaultValue={until} min={min} /></div>; }
export function EmployeeTimeLinks({ employeeId }: { employeeId: string }) { return <nav aria-label="Employee workspace" className="flex flex-wrap gap-5 text-sm text-blue-700"><Link href={`/manage/employees/${employeeId}`}>Employee profile</Link><Link href={`/manage/employees/${employeeId}/schedule`}>Schedule</Link><Link href={`/manage/employees/${employeeId}/attendance`}>Attendance</Link></nav>; }

function HolidayWork() { return <label className="flex items-start gap-2 text-sm"><input name="holidayWorkRequired" type="checkbox" className="mt-1"/>Require work on overlapping company holidays. Use a bounded temporary assignment with an explicit reason.</label>; }
