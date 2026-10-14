"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, UsersRound, SearchX } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Metric } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { LiveElapsed } from "@/components/time/live-elapsed";
import { cn } from "@/lib/utils/cn";
import type { LiveWorkforce, LiveRow } from "@/features/time/live";
import { liveStatuses as statusLabel, liveStatusTone as statusTone, type LiveStatus } from "@/features/time/live-status";
/** Refresh interval while the page is visible (server time; the browser clock is never used for status). */
const POLL_MS = 15000;
function clock(iso: string, zone: string, withDate: boolean) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return withDate ? `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}` : `${parts.hour}:${parts.minute}`;
}
const updatedAt = (iso: string, zone: string) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map(x => [x.type, x.value])); return `${p.hour}:${p.minute}:${p.second}`; };
/**
 * Live "Currently working" view for Admin and HR/Manager. Rendered with server data, then refreshed from
 * /api/manage/live-workforce every 15 s while visible, after any confirmed save in this window, and on demand.
 * A failed refresh keeps the last confirmed result on screen and says so — it never falls back to zero.
 */
export function LiveWorkforcePanel({ initial, attention = false }: { initial: LiveWorkforce | null; attention?: boolean }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(initial ? null : "The live workforce list could not be loaded.");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(""), [department, setDepartment] = useState(""), [status, setStatus] = useState("");
  const inflight = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (inflight.current) return; // one request at a time; overlapping triggers share the running one
    const controller = new AbortController(); inflight.current = controller; setLoading(true);
    try {
      const response = await fetch("/api/manage/live-workforce", { cache: "no-store", signal: controller.signal, headers: { accept: "application/json" } });
      const body = await response.json().catch(() => null) as (LiveWorkforce & { error?: string }) | null;
      if (!response.ok || !body?.summary) throw new Error(response.status === 401 || response.status === 403 ? "Your session ended or your access changed. Reload the page to sign in again." : body?.error ?? "The server could not provide live data.");
      setData(body); setError(null);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof TypeError ? "Network connection problem." : failure instanceof Error ? failure.message : "Refresh failed.");
    } finally {
      if (inflight.current === controller) inflight.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => { window.clearTimeout(timer); if (!document.hidden) timer = window.setTimeout(() => { void refresh().then(schedule); }, POLL_MS); };
    // Hidden tab: stop polling. Visible again: refresh immediately, then resume the interval.
    const visibility = () => { if (document.hidden) window.clearTimeout(timer); else void refresh().then(schedule); };
    const saved = () => { void refresh(); };
    schedule();
    document.addEventListener("visibilitychange", visibility); window.addEventListener("workspace:saved", saved);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("workspace:saved", saved); inflight.current?.abort(); };
  }, [refresh]);
  const departments = useMemo(() => [...new Set(data?.rows.map(r => r.department) ?? [])].sort(), [data]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.rows ?? []).filter(r => (!term || r.employee.name.toLowerCase().includes(term) || r.employee.number.toLowerCase().includes(term)) && (!department || r.department === department) && (!status || (status === "ATTENTION" ? r.attention : r.status === status)));
  }, [data, search, department, status]);
  const attentionRows = useMemo(() => data?.rows.filter(r => r.attention) ?? [], [data]);
  const filtered = !!(search.trim() || department || status);
  const indicator = <span className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
    <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", error ? "bg-warning" : "bg-success motion-safe:animate-pulse")} />
    {data ? <span>{error ? "Not updated · last confirmed" : "Live · updated"} <time dateTime={data.generatedAt} className="tabular-nums" suppressHydrationWarning>{updatedAt(data.generatedAt, data.timezone)}</time></span> : <span>Not loaded</span>}
  </span>;
  const refreshButton = <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading} aria-label="Refresh currently working list"><RefreshCw aria-hidden="true" size={14} className={cn(loading && "motion-safe:animate-spin")} />{loading ? "Refreshing…" : "Refresh"}</Button>;
  return <>
    <Card aria-busy={loading} data-testid="live-workforce">
      <CardHeader actions={<>{indicator}{refreshButton}</>}>
        <CardTitle>Currently working</CardTitle>
        <CardDescription>Open attendance sessions right now — including sessions that started before today. Server time{data ? ` · ${data.timezone}` : ""}; refreshes every 15 seconds.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert tone={data ? "warning" : "danger"} role="alert" title={data ? "Could not refresh" : "Live data unavailable"}>{error} {data ? "Showing the last confirmed result; it will retry automatically." : "No figures are shown until the server responds."}</Alert>}
        {data && <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="Working now" value={data.summary.working} hint="Employees with an open session" />
            <Metric label="Open sessions" value={data.summary.sessions} hint={data.summary.sessions > data.summary.working ? "More sessions than people — review" : "One per employee"} />
            <Metric label="Scheduled today" value={data.summary.scheduledToday} hint="Active accounts with a period today" />
            <Metric label="Not yet checked in" value={data.summary.notCheckedIn} hint="Period started, no session, not on leave" />
            <Metric label="Need attention" value={<span className={cn(data.summary.attention > 0 && "text-warning")}>{data.summary.attention}</span>} hint="Past end, unscheduled or flagged" />
          </div>
          {data.rows.length > 0 && <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm"><span className="font-medium">Search</span><Input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or employee ID" /></label>
            <label className="grid gap-1.5 text-sm"><span className="font-medium">Department</span><Select value={department} onChange={e => setDepartment(e.target.value)}><option value="">All departments</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}</Select></label>
            <label className="grid gap-1.5 text-sm"><span className="font-medium">Status</span><Select value={status} onChange={e => setStatus(e.target.value)}><option value="">Any status</option>{(Object.keys(statusLabel) as LiveStatus[]).map(s => <option key={s} value={s}>{statusLabel[s]}</option>)}<option value="ATTENTION">Needs attention</option></Select></label>
          </div>}
          {data.rows.length === 0 ? <EmptyState icon={UsersRound} title="Nobody is checked in right now" description="Employees appear here as soon as the server records their check-in, and leave the list when they check out." />
            : rows.length === 0 ? <EmptyState icon={SearchX} title="No one matches these filters" description={`${data.rows.length} ${data.rows.length === 1 ? "person is" : "people are"} working; clear the search or filters to see them.`} />
            : <>{filtered && <p className="text-xs text-muted-foreground">Showing {rows.length} of {data.rows.length}.</p>}<LiveTable rows={rows} data={data} /></>}
        </>}
        {!data && <div className="flex justify-center">{refreshButton}</div>}
      </CardContent>
    </Card>
    {attention && data && <Card data-testid="live-attention">
      <CardHeader><CardTitle>Open sessions requiring attention</CardTitle><CardDescription>Sessions past their scheduled end, unscheduled, open since an earlier day, or on an account that is not active. Nothing is closed automatically — check out or record a correction after review. Late checkout is not approved overtime.</CardDescription></CardHeader>
      <CardContent>{attentionRows.length === 0 ? <p className="text-sm text-muted-foreground">No open session needs attention.</p> :
        <TableContainer label="Open sessions requiring attention" flush className="rounded-lg border"><table className="data-table min-w-[760px]"><thead><tr><th>Employee</th><th>Checked in</th><th className="num">Open for</th><th>Reason</th><th>Action</th></tr></thead><tbody>{attentionRows.map(r => <tr key={r.sessionId}>
          <td><Cell2 primary={r.employee.name} secondary={r.employee.number} /></td>
          <td className="whitespace-nowrap tabular-nums" suppressHydrationWarning>{clock(r.checkinAt, data.timezone, !r.startedToday)}</td>
          <td className="num"><LiveElapsed since={r.checkinAt} serverNow={data.generatedAt} seconds={false} /></td>
          <td><div className="flex flex-wrap gap-1"><StatusBadge status={r.status} tone={statusTone[r.status]} label={statusLabel[r.status]} />{r.flags.map(f => <StatusBadge key={f} status="REVIEW" tone="danger" label={f} />)}{!r.startedToday && <StatusBadge status="EARLIER_DAY" tone="neutral" label={`Open since ${r.workDate}`} />}</div></td>
          <td><Link className="link whitespace-nowrap" href={`/manage/employees/${r.employee.id}/attendance/day?date=${r.workDate}`}>Review session</Link></td>
        </tr>)}</tbody></table></TableContainer>}</CardContent>
    </Card>}
  </>;
}
function LiveTable({ rows, data }: { rows: LiveRow[]; data: LiveWorkforce }) {
  return <TableContainer label="Currently working employees" flush className="rounded-lg border"><table className="data-table min-w-[900px]"><thead><tr><th>Employee</th><th>Status</th><th className="num">Elapsed</th><th>Session start</th><th>Today’s period</th><th>Department</th><th>Action</th></tr></thead><tbody>{rows.map(r => <tr key={r.sessionId}>
    <td><Link className="link" href={`/manage/employees/${r.employee.id}`}><Cell2 primary={r.employee.name} secondary={r.employee.number} /></Link></td>
    <td><div className="flex flex-wrap gap-1"><StatusBadge status={r.status} tone={statusTone[r.status]} label={statusLabel[r.status]} />{r.flags.map(f => <StatusBadge key={f} status="REVIEW" tone="danger" label={f} />)}</div></td>
    <td className="num font-medium"><LiveElapsed since={r.checkinAt} serverNow={data.generatedAt} seconds={false} /></td>
    <td className="whitespace-nowrap tabular-nums"><span suppressHydrationWarning>{clock(r.checkinAt, data.timezone, !r.startedToday)}</span>{!r.startedToday && <span className="block text-xs text-muted-foreground">Started on an earlier day</span>}</td>
    <td className="text-sm">{r.todayPeriods.length ? r.todayPeriods.join(", ") : <span className="text-muted-foreground">Not scheduled today</span>}</td>
    <td className="whitespace-nowrap">{r.department}</td>
    <td><Link className="link whitespace-nowrap" href={`/manage/employees/${r.employee.id}/attendance/day?date=${r.workDate}`}>View attendance</Link></td>
  </tr>)}</tbody></table></TableContainer>;
}
