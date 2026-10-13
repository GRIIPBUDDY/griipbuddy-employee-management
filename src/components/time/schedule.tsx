import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LogIn, PlayCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { Metric } from "@/components/ui/stat";
import { buttonVariants } from "@/components/ui/button";
import { checkinAction, unscheduledAction } from "@/features/time/actions";
import type { employeeSchedule } from "@/features/time/data";
import type { Occurrence } from "@/features/time/occurrences";
import { addDays, displayInstant, displayTime, localDate } from "@/features/time/dates";
import { rangeLabel } from "@/lib/utils/date-range";
import { cn } from "@/lib/utils/cn";
import { ActiveSession, SessionList, statusLabel, hm } from "./attendance";
type Data = Awaited<ReturnType<typeof employeeSchedule>>;
export function PeriodTime({ period, timezone }: { period: Occurrence; timezone: string }) {
  return <span className="tabular-nums">{displayTime(period.scheduledStartAt, timezone)}–{displayTime(period.scheduledEndAt, timezone)}{localDate(period.scheduledEndAt, timezone) !== period.workDate ? " (+1 day)" : ""}</span>;
}
const weekdayName = (date: string, style: "long" | "short" = "long") => new Intl.DateTimeFormat("en-GB", { weekday: style, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const dayMonth = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
/** Today's periods with server-validated check-in controls. */
export function TodayPanel({ data, own }: { data: Data; own: boolean }) {
  return <Card><CardHeader><CardTitle>Today · {weekdayName(data.today)} {dayMonth(data.today)}</CardTitle><CardDescription>{data.timezone} · official time at page load {displayTime(data.now, data.timezone)}. Check-in opens {data.earlyCheckinMinutes} minutes before each period.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {data.active && <ActiveSession session={data.active} own={own && data.operational} />}
      {data.periods.length === 0 && !data.active && <p className="rounded-lg border border-dashed bg-subtle px-4 py-5 text-center text-sm text-muted-foreground">No scheduled work periods today.</p>}
      {data.periods.map(p => <div key={`${p.slotId}-${p.workDate}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
        <div className="min-w-0"><p className="flex flex-wrap items-center gap-2 font-semibold"><PeriodTime period={p} timezone={data.timezone} /><StatusBadge status={p.status} label={statusLabel(p.status)} /></p>
          <p className="mt-0.5 text-sm text-muted-foreground">{p.workDate !== data.today ? `Work date ${p.workDate}. ` : ""}{p.canCheckin ? p.late ? "You are late — check-in is still allowed until the period ends." : "Check-in is open." : p.reason}</p></div>
        {own && p.canCheckin && <ActionForm compact action={checkinAction} submitLabel="Check in" submitIcon={<LogIn size={16} aria-hidden="true" />}><input type="hidden" name="slotId" value={p.slotId} /><input type="hidden" name="workDate" value={p.workDate} /><input type="hidden" name="operationKey" value={randomUUID()} /></ActionForm>}
      </div>)}
      {own && data.canUnscheduled && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3"><p className="max-w-xl text-sm text-muted-foreground">No work is assigned today. If you are asked to work, start an unscheduled session — it is recorded for HR review and does not automatically create pay.</p><ActionForm compact action={unscheduledAction} submitVariant="outline" submitLabel="Start unscheduled work" submitIcon={<PlayCircle size={16} aria-hidden="true" />} confirmation={{ title: "Start unscheduled work?", description: "This records actual work on a day with no assigned schedule. It is flagged for authorized review before any overtime is payable.", label: "Start session" }}><input type="hidden" name="operationKey" value={randomUUID()} /></ActionForm></div>}
      {own && !data.operational && <Alert tone="warning">Your account is on hold. Check-in and other operational actions are unavailable.</Alert>}
      <p className="text-sm text-muted-foreground">Next period: <span className="font-medium text-foreground">{data.next ? `${displayInstant(data.next.scheduledStartAt, data.timezone)} – ${displayTime(data.next.scheduledEndAt, data.timezone)}` : "none assigned"}</span></p>
    </CardContent></Card>;
}
export function WeekGrid({ data, path }: { data: Data; path: string }) {
  const nav = cn(buttonVariants({ variant: "outline", size: "sm" }));
  return <Card><CardHeader actions={<nav aria-label="Schedule week" className="flex gap-1.5"><Link className={nav} href={`${path}?week=${addDays(data.week, -7)}`}><ChevronLeft size={15} aria-hidden="true" /><span className="sr-only sm:not-sr-only">Previous</span></Link><Link className={nav} href={path}>This week</Link><Link className={nav} href={`${path}?week=${addDays(data.week, 7)}`}><span className="sr-only sm:not-sr-only">Next</span><ChevronRight size={15} aria-hidden="true" /></Link></nav>}>
    <CardTitle>Week of {rangeLabel(data.week, addDays(data.weekEnd, -1))}</CardTitle><CardDescription>Recurring schedule occurrences for this week · {data.timezone}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">{data.days.map(day => { const today = day.date === data.today, empty = !day.periods.length && !day.carryover.length; return <div key={day.date} className={cn("min-w-0 rounded-lg border p-3", today ? "border-primary/40 bg-primary-soft/50" : empty ? "bg-subtle" : "bg-surface")}>
        <p className="flex items-baseline justify-between gap-2 text-sm"><span className="font-semibold">{weekdayName(day.date, "short")}</span><span className={cn("text-xs tabular-nums", today ? "font-semibold text-primary" : "text-muted-foreground")}>{today ? "Today" : dayMonth(day.date)}</span></p>
        <div className="mt-2 space-y-1.5">{day.carryover.map(p => <p key={p.slotId} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">…until {displayTime(p.eligibleEndAt, data.timezone)}</p>)}{day.periods.map(p => <p key={p.slotId} className="rounded-md border border-[#c3cbf5] bg-surface px-2 py-1 text-xs font-medium text-[#1d2d7a]"><PeriodTime period={p} timezone={data.timezone} /></p>)}{empty && <p className="text-xs text-muted-foreground">Rest day</p>}</div>
      </div>; })}</div>
      <div className="grid gap-3 sm:grid-cols-3"><Metric label="Scheduled this week" value={hm(data.scheduledSeconds)} /><Metric label="Standard weekly hours" value={`${data.standardWeeklyHours}h 00m`} hint="Separate from the overtime threshold" /><Metric label="Completed actual time" value={hm(data.actualSeconds)} hint="Open sessions count after checkout" /></div>
    </CardContent></Card>;
}
export function ScheduleView({ data, own, path }: { data: Data; own: boolean; path: string }) {
  return <>
    {data.issues.length > 0 && <Alert tone="warning" role="alert" title="Some periods could not be resolved">{data.issues.map(i => `${i.date}: ${i.message}`).join(" ")}</Alert>}
    <TodayPanel data={data} own={own} />
    <WeekGrid data={data} path={path} />
    <Card><CardHeader actions={<Link className="link text-sm" href={own ? "/me/attendance" : `/manage/employees/${data.employee.id}/attendance`}>Full attendance history</Link>}><CardTitle>Recent attendance</CardTitle></CardHeader><CardContent><SessionList sessions={data.recent} /></CardContent></Card>
  </>;
}
