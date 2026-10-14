import { randomUUID } from "node:crypto";
import Link from "next/link";
import { LogOut, Clock3 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { checkoutAction } from "@/features/time/actions";
import { dateKey, displayInstant, displayTime, durationLabel } from "@/features/time/dates";
import type { sessionView, attendanceHistory } from "@/features/time/data";
import { LiveElapsed } from "./live-elapsed";
type Session = ReturnType<typeof sessionView>;
export const statusLabel = (status: string) => ({ CURRENTLY_WORKING: "Currently working", COMPLETED: "Completed", INCOMPLETE: "Incomplete · currently working", UPCOMING: "Upcoming", READY: "Ready to check in", NOT_ELIGIBLE: "Not eligible to check in", VOIDED: "Voided" }[status] ?? status);
export const hm = (seconds: number) => { const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60); return `${h}h ${String(m).padStart(2, "0")}m`; };
export function Checkout({ session }: { session: Session }) {
  return <ActionForm key={session.id} compact action={checkoutAction} submitLabel="Check out" submitIcon={<LogOut size={16} aria-hidden="true" />} confirmation={{ title: "Check out now?", description: "Your actual checkout time is recorded from the official server clock. Checking out late does not by itself create payable overtime.", label: "Check out" }}><input type="hidden" name="sessionId" value={session.id} /><input type="hidden" name="operationKey" value={randomUUID()} /></ActionForm>;
}
export function ActiveSession({ session, own }: { session: Session; own: boolean }) {
  return <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#b2ddff] bg-info-soft p-4 sm:p-5">
    <div className="flex items-start gap-3"><span className="relative mt-1 flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-40" /><span className="relative inline-flex h-3 w-3 rounded-full bg-info" /></span>
      <div><p className="font-semibold text-[#194185]">Currently working</p><p className="mt-1 text-2xl font-semibold text-[#194185]"><LiveElapsed since={session.checkinAt.toISOString()} serverNow={new Date(session.checkinAt.getTime() + (session.provisionalSeconds ?? 0) * 1000).toISOString()} /></p><p className="mt-0.5 text-sm text-[#1849a9]">Checked in {displayInstant(session.checkinAt, session.timezoneSnapshot)} · time worked updates live; the official total is set at checkout</p>
        <p className="mt-1 text-xs text-[#1849a9]">{session.incomplete ? "The scheduled period has ended and checkout is missing. Check out as soon as you finish." : own ? "Checkout stays available after the scheduled end and across midnight." : "Checkout requires an active account with operational access."}</p></div></div>
    {own && <Checkout session={session} />}
  </div>;
}
export function SessionList({ sessions, own = false }: { sessions: Session[]; own?: boolean }) {
  if (!sessions.length) return <EmptyState icon={Clock3} title="No attendance sessions" description="Check-ins and checkouts for the selected dates will appear here." />;
  return <TableContainer label="Attendance sessions" flush className="rounded-lg border"><table className="data-table min-w-[720px]"><thead><tr><th>Work date</th><th>Scheduled</th><th>Check-in</th><th>Checkout</th><th className="num">Duration</th><th>Status</th>{own && <th><span className="sr-only">Actions</span></th>}</tr></thead><tbody>{sessions.map(s => <tr key={s.id}>
    <td className="whitespace-nowrap font-medium tabular-nums">{dateKey(s.workDate)}</td>
    <td className="whitespace-nowrap text-muted-foreground">{s.scheduledStartAt && s.scheduledEndAt ? `${displayTime(s.scheduledStartAt, s.timezoneSnapshot)}–${displayTime(s.scheduledEndAt, s.timezoneSnapshot)}` : "Unscheduled"}</td>
    <td><Cell2 primary={displayInstant(s.checkinAt, s.timezoneSnapshot)} secondary={s.lateSeconds > 0 ? <span className="text-warning">Late by {durationLabel(s.lateSeconds)}</span> : s.source !== "SELF" ? `Source: ${s.source.toLowerCase()}` : undefined} /></td>
    <td className="whitespace-nowrap">{s.checkoutAt ? displayInstant(s.checkoutAt, s.timezoneSnapshot) : <span className="text-warning">Missing</span>}</td>
    <td className="num">{s.durationSeconds === null ? <span className="text-muted-foreground" title="Running time since check-in (provisional until checkout)">{s.voidedAt ? hm(s.provisionalSeconds ?? 0) : <LiveElapsed since={s.checkinAt.toISOString()} serverNow={new Date(s.checkinAt.getTime() + (s.provisionalSeconds ?? 0) * 1000).toISOString()} seconds={false} />}*</span> : hm(s.durationSeconds)}</td>
    <td><StatusBadge status={s.status} label={statusLabel(s.status)} /></td>
    {own && <td className="text-right">{!s.voidedAt && <Link className="link text-[13px]" href={`/me/corrections?sessionId=${s.id}`}>Request correction</Link>}</td>}
  </tr>)}</tbody></table></TableContainer>;
}
export function CorrectionFoundation() { return <Card><CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5"><div><p className="font-semibold">Missing or incorrect attendance?</p><p className="mt-1 text-sm text-muted-foreground">Submit a correction request with the proposed times and an explanation. Official times change only after authorized review.</p></div><Link href="/me/corrections" className="link text-sm">Attendance corrections</Link></CardContent></Card>; }
export function AttendanceHistory({ data, own, path, query = {} }: { data: Awaited<ReturnType<typeof attendanceHistory>>; own: boolean; path: string; query?: Record<string, string | string[] | undefined> }) {
  const active = data.records.find(s => !s.checkoutAt && !s.voidedAt);
  return <>{own && active && data.operational && <ActiveSession session={active} own />}
    <Card><CardHeader><CardTitle>Attendance sessions</CardTitle><CardDescription>Work date follows the scheduled period’s start date. * Open sessions show provisional elapsed time.</CardDescription></CardHeader><CardContent className="space-y-4"><SessionList sessions={data.records} own={own && data.operational} /><Pagination page={data.page} pages={data.pages} total={data.total} noun="sessions" query={query} path={path} /></CardContent></Card>{own && <CorrectionFoundation />}
  </>;
}
