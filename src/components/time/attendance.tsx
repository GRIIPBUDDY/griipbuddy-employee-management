import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { checkoutAction } from "@/features/time/actions";
import { dateKey, displayInstant, durationLabel } from "@/features/time/dates";
import type { sessionView, attendanceHistory } from "@/features/time/data";
type Session = ReturnType<typeof sessionView>;
export const statusLabel = (status: string) => ({ CURRENTLY_WORKING: "Currently working", COMPLETED: "Completed", INCOMPLETE: "Incomplete · currently working", UPCOMING: "Upcoming", READY: "Ready to check in", NOT_ELIGIBLE: "Not eligible to check in", VOIDED: "Voided" }[status] ?? status);
export function Checkout({ session }: { session: Session }) {
  return <ActionForm key={session.id} action={checkoutAction} submitLabel="Check out"><input type="hidden" name="sessionId" value={session.id} /><input type="hidden" name="operationKey" value={randomUUID()} /></ActionForm>;
}
export function ActiveSession({ session, own }: { session: Session; own: boolean }) {
  return <Card><CardHeader><CardTitle>Currently working</CardTitle><CardDescription>Checked in {displayInstant(session.checkinAt, session.timezoneSnapshot)}</CardDescription></CardHeader><CardContent className="space-y-4">
    <p className="text-sm">{session.incomplete ? "Incomplete: the scheduled period ended and checkout is missing. Your session remains open." : "Your attendance session is open."} Checkout remains available after the scheduled end and after midnight.</p>
    <p className="text-sm text-muted-foreground">Elapsed at page load: {durationLabel(session.provisionalSeconds ?? 0)} · provisional until checkout.</p>{own && <Checkout session={session} />}
  </CardContent></Card>;
}
export function SessionList({ sessions, own = false }: { sessions: Session[]; own?: boolean }) {
  return <div className="space-y-3">{sessions.map(s => <article key={s.id} className="space-y-2 rounded-lg border p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{dateKey(s.workDate)} · {statusLabel(s.status)}</strong><span className="text-muted-foreground">{s.source} · {s.timezoneSnapshot}</span></div>
    <p>Scheduled: {s.scheduledStartAt && s.scheduledEndAt ? `${displayInstant(s.scheduledStartAt, s.timezoneSnapshot)} – ${displayInstant(s.scheduledEndAt, s.timezoneSnapshot)}` : "No scheduled period"}</p>
    <p>Actual check-in: {displayInstant(s.checkinAt, s.timezoneSnapshot)}{s.lateSeconds > 0 && <span className="ml-2 text-amber-800">Late by {durationLabel(s.lateSeconds)}</span>}</p><p>Actual checkout: {s.checkoutAt ? displayInstant(s.checkoutAt, s.timezoneSnapshot) : "Missing · currently working"}</p>
    {own && !s.voidedAt && <Link className="text-blue-700" href={`/me/corrections?sessionId=${s.id}`}>Request a correction</Link>}
    <p>{s.durationSeconds === null ? `Elapsed at page load: ${durationLabel(s.provisionalSeconds ?? 0)} (provisional)` : `Session duration: ${durationLabel(s.durationSeconds)}`}</p>
  </article>)}{sessions.length === 0 && <p className="text-sm text-muted-foreground">No attendance sessions recorded.</p>}</div>;
}
export function CorrectionFoundation() { return <Card><CardHeader><CardTitle>Missing or incorrect attendance?</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Provide the work date, proposed actual times and an explanation. Submit an attendance correction request for review. Official timestamps change only through authorized approval.</p><Link href="/me/corrections" className="mt-3 inline-block text-sm text-blue-700">My correction requests</Link></CardContent></Card>; }
export function AttendanceHistory({ data, own, path }: { data: Awaited<ReturnType<typeof attendanceHistory>>; own: boolean; path: string }) {
  return <>{own && data.records.find(s => !s.checkoutAt && !s.voidedAt) && <ActiveSession session={data.records.find(s => !s.checkoutAt && !s.voidedAt)!} own />}
    <Card><CardHeader><CardTitle>Attendance sessions</CardTitle><CardDescription>Work date follows the scheduled period’s start date. Actual durations are factual time, with weekly potential and approved overtime shown separately.</CardDescription></CardHeader><CardContent><SessionList sessions={data.records} own={own} /><nav aria-label="Attendance pagination" className="mt-5 flex flex-wrap gap-5 text-sm"><span>Page {data.page} of {data.pages} · {data.total} sessions</span>{data.page > 1 && <Link className="text-blue-700" href={`${path}?page=${data.page - 1}`}>Previous</Link>}{data.page < data.pages && <Link className="text-blue-700" href={`${path}?page=${data.page + 1}`}>Next</Link>}</nav></CardContent></Card>{own && <CorrectionFoundation />}
  </>;
}
