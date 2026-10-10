import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { checkinAction } from "@/features/time/actions";
import type { employeeSchedule } from "@/features/time/data";
import type { Occurrence } from "@/features/time/occurrences";
import { addDays, displayInstant, displayTime, localDate, durationLabel } from "@/features/time/dates";
import { ActiveSession, SessionList, statusLabel } from "./attendance";
export function PeriodTime({ period, timezone }: { period: Occurrence; timezone: string }) {
  return <span>{displayTime(period.scheduledStartAt, timezone)}–{displayTime(period.scheduledEndAt, timezone)}{localDate(period.scheduledEndAt, timezone) !== period.workDate ? " (+1 day)" : ""}</span>;
}
export function ScheduleView({ data, own, path }: { data: Awaited<ReturnType<typeof employeeSchedule>>; own: boolean; path: string }) {
  return <><p className="text-sm text-muted-foreground">Today: {data.today} · {data.timezone} · Official time at page load: {displayInstant(data.now, data.timezone)}. Check-in opens {data.earlyCheckinMinutes} minutes before each period. Refresh for current availability.</p>
    {data.active && <ActiveSession session={data.active} own={own} />}
    <Card><CardHeader><CardTitle>Today’s schedule</CardTitle><CardDescription>{own ? "Check-in availability is confirmed against official server time when you submit." : "Employee attendance status and assigned work periods."}</CardDescription></CardHeader><CardContent className="space-y-4">
      {data.periods.map(p => <article key={`${p.slotId}-${p.workDate}`} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"><div className="space-y-1"><p className="font-medium"><PeriodTime period={p} timezone={data.timezone} /> · {statusLabel(p.status)}</p>{p.workDate !== data.today && <p className="text-sm">Work date: {p.workDate}</p>}<p className="text-sm text-muted-foreground">{p.canCheckin ? p.late ? "Late arrival is allowed until the scheduled end." : "Ready to check in." : p.reason}</p></div>
        {own && p.canCheckin && <ActionForm action={checkinAction} submitLabel="Check in"><input type="hidden" name="slotId" value={p.slotId} /><input type="hidden" name="workDate" value={p.workDate} /><input type="hidden" name="operationKey" value={randomUUID()} /></ActionForm>}
      </article>)}{data.periods.length === 0 && <p className="text-sm text-muted-foreground">No scheduled work periods today.</p>}
      <p className="text-sm">Next scheduled period: {data.next ? `${displayInstant(data.next.scheduledStartAt, data.timezone)} – ${displayInstant(data.next.scheduledEndAt, data.timezone)}` : "No upcoming period assigned."}</p>
    </CardContent></Card>
    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Weekly schedule</CardTitle><nav aria-label="Schedule week" className="flex gap-4 text-sm text-blue-700"><Link href={`${path}?week=${addDays(data.week, -7)}`}>Previous week</Link><Link href={path}>This week</Link><Link href={`${path}?week=${addDays(data.week, 7)}`}>Next week</Link></nav></div><CardDescription>{data.week} through {addDays(data.weekEnd, -1)} · {data.timezone}</CardDescription></CardHeader><CardContent>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.days.map(day => <article key={day.date} className="space-y-3 rounded-lg border p-4 text-sm"><h3 className="font-semibold">{new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${day.date}T00:00:00Z`))}<span className="mt-1 block font-normal text-muted-foreground">{day.date}</span></h3>{day.carryover.map(p => <p key={p.slotId} className="text-muted-foreground">Continues from {p.workDate} until {displayTime(p.eligibleEndAt, data.timezone)}</p>)}{day.periods.map(p => <p key={p.slotId}><PeriodTime period={p} timezone={data.timezone} />{p.label && <span className="block text-muted-foreground">{p.label}</span>}</p>)}{day.periods.length === 0 && day.carryover.length === 0 && <p className="text-muted-foreground">No scheduled periods</p>}</article>)}</div>
      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm"><p>Scheduled time in this week: <strong>{durationLabel(data.scheduledSeconds)}</strong></p><p>Completed actual time in this week: <strong>{durationLabel(data.actualSeconds)}</strong></p></div><p className="mt-2 text-xs text-muted-foreground">Time is clipped to this week’s boundaries. Open sessions are provisional and excluded from completed actual time. These totals do not calculate overtime or payable hours.</p>
    </CardContent></Card>
    {data.issues.length > 0 && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{data.issues.map(i => `${i.date}: ${i.message}`).join(" ")}</p>}
    <Card><CardHeader><CardTitle>Recent attendance</CardTitle></CardHeader><CardContent><SessionList sessions={data.recent} /><Link className="mt-4 inline-block text-sm text-blue-700" href={own ? "/me/attendance" : `/manage/employees/${data.employee.id}/attendance`}>View attendance history</Link></CardContent></Card>
  </>;
}
