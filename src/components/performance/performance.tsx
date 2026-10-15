import Link from "next/link";
import { Plus, Target, Trophy, ClipboardCheck } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextAreaField, FieldGrid } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { TableContainer, Cell2 } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Metric } from "@/components/ui/stat";
import { Alert } from "@/components/ui/alert";
import { TabNav } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Hidden } from "@/components/review/forms";
import { hm } from "@/components/time/attendance";
import { performanceAction } from "@/features/performance/actions";
import { explainAtOrBelow, workTimeSplit, weights } from "@/features/performance/policy";
type Tone = "success" | "warning" | "danger" | "info" | "neutral";
export const pts = (value: number | null | undefined, max?: number) => value === null || value === undefined ? "—" : `${value.toFixed(2)}${max !== undefined ? ` / ${max.toFixed(2)}` : ""}`;
const pct = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${Math.round(value * 1000) / 10}%`;
export function RatingsNav() {
  return <TabNav label="Performance ratings" items={[{ label: "Monthly ratings", href: "/manage/ratings", exact: true }, { label: "Quarterly ranking", href: "/manage/ratings/ranking" }, { label: "Targets", href: "/manage/targets" }]} />;
}
const statusInfo: Record<string, [string, Tone]> = { FINALIZED: ["Finalized", "success"], DRAFT: ["Draft", "info"], NOT_STARTED: ["Not started", "neutral"], COMPLETE: ["Complete", "success"], INCOMPLETE: ["Incomplete", "warning"], NOT_APPLICABLE: ["Not applicable", "neutral"], FINAL: ["Final", "success"], PROVISIONAL: ["Provisional", "warning"] };
export function RatingStatus({ status }: { status: string }) { const [label, tone] = statusInfo[status] ?? [status, "neutral"]; return <StatusBadge status={status} label={label} tone={tone} />; }
type Employee = { id: string; legalName: string; employeeNumber: string };
export function NewTargetButton({ employees, today }: { employees: Employee[]; today: string }) {
  return <Dialog variant="default" size="lg" trigger={<><Plus size={16} aria-hidden="true" />New target</>} title="Assign a target" description="Each chosen employee gets an independent target; one person's result never changes another's. A weekly target covers the week containing the date; a monthly target covers its calendar month.">
    <ActionForm action={performanceAction} submitLabel="Assign target"><Hidden values={{ kind: "createTarget" }} />
      <fieldset className="grid gap-1.5 text-sm"><legend className="mb-1.5 font-medium">Employees<span aria-hidden="true" className="ml-0.5 text-danger">*</span></legend>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">{employees.map(e => <label key={e.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-subtle"><input type="checkbox" name="employeeIds" value={e.id} className="h-4 w-4" />{e.legalName} <span className="text-xs text-muted-foreground">{e.employeeNumber}</span></label>)}</div></fieldset>
      <FieldGrid><SelectField label="Period" name="periodType" required defaultValue="MONTHLY"><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></SelectField><Field label="Date in the period" name="periodDate" type="date" required defaultValue={today} /></FieldGrid>
      <Field label="Target" name="title" required maxLength={150} placeholder="e.g. Process eligible orders" />
      <FieldGrid><Field label="Target value" name="targetValue" type="number" required min="0.01" step="0.01" /><Field label="Unit" name="unit" required maxLength={40} placeholder="orders, tickets, %" /></FieldGrid>
      <TextAreaField label="Description (optional)" name="description" rows={2} maxLength={2000} />
      <TextAreaField label="Notes (optional)" name="notes" rows={2} maxLength={1000} hint="Visible to the employee with the target." />
    </ActionForm></Dialog>;
}
type TargetRow = { id: string; employee?: Employee; title: string; description: string; periodType: string; periodStart: string; periodEnd: string; targetValue: number; unit: string; actualValue: number | null; resultNote: string | null; status: string; notes: string; revision: number; achievement: number | null; rawAchievement: number | null };
export function TargetState({ t }: { t: TargetRow }) {
  return t.status === "CANCELLED" ? <StatusBadge status="CANCELLED" label="Cancelled" tone="neutral" /> : t.actualValue === null ? <StatusBadge status="PENDING" label="Awaiting result" tone="warning" /> : <StatusBadge status="RECORDED" label="Result recorded" tone="success" />;
}
export function TargetTable({ records, today, staff }: { records: TargetRow[]; today: string; staff: boolean }) {
  if (!records.length) return <EmptyState icon={Target} title="No targets" description={staff ? "Change the filters, or assign a target." : "No targets have been assigned to you."} />;
  return <TableContainer label="Targets"><table className="data-table min-w-[960px]"><thead><tr>{staff && <th>Employee</th>}<th>Target</th><th>Period</th><th className="num">Target</th><th className="num">Actual</th><th className="num">Achievement</th><th>Status</th>{staff && <th className="text-right">Action</th>}</tr></thead><tbody>{records.map(t => <tr key={t.id}>
    {staff && <td><Cell2 primary={t.employee?.legalName ?? "—"} secondary={t.employee?.employeeNumber} /></td>}
    <td className="max-w-xs"><Cell2 primary={t.title} secondary={[t.description, t.notes].filter(Boolean).join(" · ") || undefined} /></td>
    <td className="whitespace-nowrap tabular-nums"><Cell2 primary={t.periodType === "WEEKLY" ? "Weekly" : "Monthly"} secondary={`${t.periodStart} – ${t.periodEnd}`} /></td>
    <td className="num">{t.targetValue.toLocaleString("en")} {t.unit}</td>
    <td className="num">{t.actualValue === null ? "—" : `${t.actualValue.toLocaleString("en")} ${t.unit}`}{t.resultNote && <span className="block text-xs text-muted-foreground">{t.resultNote}</span>}</td>
    <td className="num">{t.rawAchievement === null ? "—" : <>{pct(t.rawAchievement)}{t.rawAchievement > 1 && <span className="block text-xs text-muted-foreground">scored as 100%</span>}</>}</td>
    <td><TargetState t={t} /></td>
    {staff && <td className="text-right"><div className="flex justify-end gap-1">{t.status === "ACTIVE" && t.periodStart <= today && <Dialog triggerSize="sm" variant={t.actualValue === null ? "default" : "ghost"} trigger={t.actualValue === null ? "Record result" : "Correct result"} triggerLabel={`Result for ${t.title} · ${t.employee?.legalName}`} title={t.actualValue === null ? "Record the actual result" : "Correct the result"} description="Enter the verified figure. Every change is kept in the audit log; a finalized monthly rating does not change.">
        <ActionForm action={performanceAction} submitLabel="Save result"><Hidden values={{ kind: "result", id: t.id, revision: t.revision }} /><Field label={`Actual result (${t.unit})`} name="actualValue" type="number" required min="0" step="0.01" defaultValue={t.actualValue ?? undefined} />
          <TextAreaField label={t.actualValue === null ? "Note (optional)" : "Reason for the correction"} name="note" rows={2} maxLength={1000} required={t.actualValue !== null} /></ActionForm></Dialog>}
      {t.status === "ACTIVE" && t.periodStart > today && <Dialog triggerSize="sm" variant="ghost" trigger="Edit" triggerLabel={`Edit ${t.title} · ${t.employee?.legalName}`} title="Edit future target"><ActionForm action={performanceAction} submitLabel="Save"><Hidden values={{ kind: "editTarget", id: t.id, revision: t.revision }} />
        <Field label="Target" name="title" required maxLength={150} defaultValue={t.title} /><FieldGrid><Field label="Target value" name="targetValue" type="number" required min="0.01" step="0.01" defaultValue={t.targetValue} /><Field label="Unit" name="unit" required maxLength={40} defaultValue={t.unit} /></FieldGrid>
        <TextAreaField label="Description" name="description" rows={2} maxLength={2000} defaultValue={t.description} /><TextAreaField label="Notes" name="notes" rows={2} maxLength={1000} defaultValue={t.notes} /></ActionForm></Dialog>}
      {t.status === "ACTIVE" && <Dialog triggerSize="sm" variant="ghost" trigger="Cancel" triggerLabel={`Cancel ${t.title} · ${t.employee?.legalName}`} title="Cancel this target" description="A cancelled target is kept in history and excluded from scoring."><ActionForm action={performanceAction} submitLabel="Cancel target" confirmation={{ title: "Cancel this target?", description: "It will no longer count toward the monthly rating.", label: "Cancel target", destructive: true }}><Hidden values={{ kind: "cancelTarget", id: t.id, revision: t.revision }} /><TextAreaField label="Reason" name="reason" required rows={2} maxLength={1000} /></ActionForm></Dialog>}</div></td>}
  </tr>)}</tbody></table></TableContainer>;
}
type Component = { key: string; label: string; status: string; ratio: number | null; weight: number; max: number; points: number | null; reason?: string };
type Breakdown = { month: string; score: { status: string; components: Component[]; raw: number | null }; deduction: number; mapping: Record<string, number>; workTime: { requiredSeconds: number; creditedSeconds: number; missingSeconds: number; confirmedAwaySeconds: number; eligibleDays: number; attendedDays: number; minutesRatio: number | null; daysRatio: number | null };
  tasks: { total: number; onTime: number; late: number; notCompleted: number; items: { id: string; title: string; dueDate: string; completedOn: string | null; outcome: string }[] }; targets: { items: { id: string; title: string; periodType: string; periodStart: string; periodEnd: string; unit: string; target: number; actual: number | null; achievement: number | null }[] }; warnings: { id: string; label: string; issueDate: string; points: number }[] };
export type AssessmentView = { status: string; manual: number | null; raw: number | null; deduction: number | null; automated: number | null; total: number | null; breakdown: Breakdown | null; blockers: string[]; comment: string; privateNote?: string; finalizedAt: Date | null; revision: number; reopenReason: string | null };
export function ScoreSummary({ a }: { a: AssessmentView }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
    <Metric label="HR/Admin assessment" value={pts(a.manual, 5)} />
    <Metric label="Raw automated" value={pts(a.raw, 5)} hint="Work time, tasks, targets" />
    <Metric label="Warning deduction" value={a.deduction ? <span className="text-danger">−{a.deduction.toFixed(2)}</span> : "0.00"} />
    <Metric label="Final automated" value={pts(a.automated, 5)} />
    <Metric label="Monthly rating" value={<span className="text-primary">{pts(a.total, 10)}</span>} />
  </div>;
}
const outcomes: Record<string, [string, Tone]> = { ON_TIME: ["On time", "success"], LATE: ["Completed late", "warning"], NOT_COMPLETED: ["Not completed", "danger"] };
/** The full, explained breakdown. Employees see the same numbers without private notes. */
export function Breakdown({ b }: { b: Breakdown }) {
  return <div className="space-y-5">
    <TableContainer label="Automated components" flush className="rounded-lg border"><table className="data-table min-w-[720px]"><thead><tr><th>Component</th><th>Status</th><th className="num">Achieved</th><th className="num">Weight</th><th className="num">Points</th></tr></thead><tbody>
      {b.score.components.map(c => <tr key={c.key}><td><Cell2 primary={c.label} secondary={c.reason} /></td><td><RatingStatus status={c.status} /></td><td className="num">{pct(c.ratio)}</td><td className="num">{c.status === "NOT_APPLICABLE" ? "—" : c.max === c.weight ? c.max.toFixed(2) : <>{c.max.toFixed(2)}<span className="block text-xs text-muted-foreground">{c.weight.toFixed(2)} redistributed</span></>}</td><td className="num font-medium">{pts(c.points)}</td></tr>)}
      <tr><td colSpan={4} className="text-right font-medium">Raw automated score</td><td className="num font-semibold">{pts(b.score.raw, 5)}</td></tr>
    </tbody></table></TableContainer>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Work time and attendance</CardTitle><CardDescription>{Math.round(workTimeSplit.minutes * 100)} % scheduled minutes completed, {Math.round(workTimeSplit.days * 100)} % scheduled days attended (max {weights.workTime.toFixed(2)} points). Approved leave and holidays are not expected work.</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3"><Metric label="Expected payable" value={hm(b.workTime.requiredSeconds)} /><Metric label="Verified work" value={hm(b.workTime.creditedSeconds)} hint={pct(b.workTime.minutesRatio)} /><Metric label="Missing" value={hm(b.workTime.missingSeconds)} hint={b.workTime.confirmedAwaySeconds ? `incl. ${hm(b.workTime.confirmedAwaySeconds)} confirmed away` : undefined} /><Metric label="Days attended" value={`${b.workTime.attendedDays} / ${b.workTime.eligibleDays}`} hint={pct(b.workTime.daysRatio)} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Assigned tasks</CardTitle><CardDescription>Tasks due this month, completed by their due date (max {weights.tasks.toFixed(2)} points).</CardDescription></CardHeader>
        <CardContent>{b.tasks.items.length ? <ul className="divide-y text-sm">{b.tasks.items.map(t => { const [label, tone] = outcomes[t.outcome]; return <li key={t.id} className="flex items-center justify-between gap-3 py-2"><span><span className="font-medium">{t.title}</span><span className="block text-xs text-muted-foreground">Due {t.dueDate}{t.completedOn ? ` · completed ${t.completedOn}` : ""}</span></span><StatusBadge status={t.outcome} label={label} tone={tone} /></li>; })}</ul> : <p className="text-sm text-muted-foreground">No tasks were due this month.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Targets</CardTitle><CardDescription>Actual ÷ target, capped at 100 % per target, averaged (max {weights.targets.toFixed(2)} points).</CardDescription></CardHeader>
        <CardContent>{b.targets.items.length ? <ul className="divide-y text-sm">{b.targets.items.map(t => <li key={t.id} className="flex items-center justify-between gap-3 py-2"><span><span className="font-medium">{t.title}</span><span className="block text-xs text-muted-foreground">{t.periodType === "WEEKLY" ? "Weekly" : "Monthly"} · {t.periodStart} – {t.periodEnd}</span></span><span className="text-right tabular-nums">{t.actual === null ? <StatusBadge status="PENDING" label="Awaiting result" tone="warning" /> : <>{t.actual} / {t.target} {t.unit}<span className="block text-xs text-muted-foreground">{pct(t.achievement)}</span></>}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No targets ended this month.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Warning deductions</CardTitle><CardDescription>Only issued warnings released to the employee and not revoked; deducted from the automated score only, never below zero.</CardDescription></CardHeader>
        <CardContent>{b.warnings.length ? <ul className="divide-y text-sm">{b.warnings.map(w => <li key={w.id} className="flex items-center justify-between py-2"><span>{w.label} · {w.issueDate}</span><span className="font-medium text-danger tabular-nums">−{w.points.toFixed(2)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No confirmed warnings this month.</p>}</CardContent></Card>
    </div>
  </div>;
}
const scores = Array.from({ length: 11 }, (_, i) => (i * 0.5).toFixed(1));
export function ManualForm({ employeeId, month, a }: { employeeId: string; month: string; a: AssessmentView }) {
  return <ActionForm action={performanceAction} submitLabel="Save manual assessment"><Hidden values={{ kind: "manual", employeeId, month: month.slice(0, 7), revision: a.revision }} />
    <FieldGrid><SelectField label="Manual score (0–5)" name="manualScore" required defaultValue={a.manual?.toFixed(1) ?? ""}><option value="">Choose</option>{scores.map(s => <option key={s} value={s}>{s}</option>)}</SelectField></FieldGrid>
    <TextAreaField label="Review comment (shown to the employee)" name="comment" rows={3} maxLength={2000} defaultValue={a.comment} hint={`Required for a score of ${explainAtOrBelow} or lower.`} />
    <TextAreaField label="Private HR note (never shown to the employee)" name="privateNote" rows={2} maxLength={2000} defaultValue={a.privateNote} />
  </ActionForm>;
}
export function FinalizeForm({ employeeId, month, a }: { employeeId: string; month: string; a: AssessmentView }) {
  if (a.blockers.length) return <Alert tone="warning" title="Not ready to finalize"><ul className="list-disc pl-4">{a.blockers.map(b => <li key={b}>{b}</li>)}</ul></Alert>;
  return <ActionForm action={performanceAction} submitLabel="Finalize monthly rating" confirmation={{ title: "Finalize this monthly rating?", description: `Monthly rating ${pts(a.total, 10)}. The numbers and every input are frozen; later changes to attendance, tasks, targets or warnings do not alter it. Only an administrator can reopen it.`, label: "Finalize" }}>
    <Hidden values={{ kind: "finalize", employeeId, month: month.slice(0, 7), revision: a.revision }} /></ActionForm>;
}
export function ReopenForm({ employeeId, month, a }: { employeeId: string; month: string; a: AssessmentView }) {
  return <Dialog variant="outline" trigger="Reopen for correction" title="Reopen this finalized rating" description="Returns the month to Draft so it can be recalculated. The finalized values stay in the audit log and the manual assessment is kept.">
    <ActionForm action={performanceAction} submitLabel="Reopen"><Hidden values={{ kind: "reopen", employeeId, month: month.slice(0, 7), revision: a.revision }} /><TextAreaField label="Reason" name="reason" required rows={2} maxLength={1000} /></ActionForm></Dialog>;
}
type RosterRow = AssessmentView & { employee: Employee; department: string };
export function RosterTable({ records, month }: { records: RosterRow[]; month: string }) {
  if (!records.length) return <EmptyState icon={ClipboardCheck} title="No employees match" description="Change the month or filters." />;
  const component = (r: RosterRow, key: string) => { const c = r.breakdown?.score.components.find(x => x.key === key); return !c ? "—" : c.status === "COMPLETE" ? pts(c.points, c.max) : c.status === "NOT_APPLICABLE" ? <span className="text-muted-foreground">n/a</span> : <span className="text-warning">Incomplete</span>; };
  return <TableContainer label="Monthly ratings"><table className="data-table min-w-[1100px]"><thead><tr><th>Employee</th><th className="num">Manual /5</th><th className="num">Work time</th><th className="num">Tasks</th><th className="num">Targets</th><th className="num">Warnings</th><th className="num">Automated /5</th><th className="num">Rating /10</th><th>Status</th><th className="text-right">Action</th></tr></thead><tbody>{records.map(r => <tr key={r.employee.id}>
    <td><Cell2 primary={r.employee.legalName} secondary={`${r.employee.employeeNumber} · ${r.department}`} /></td>
    <td className="num">{pts(r.manual)}</td><td className="num">{component(r, "workTime")}</td><td className="num">{component(r, "tasks")}</td><td className="num">{component(r, "targets")}</td>
    <td className="num">{r.deduction ? <span className="text-danger">−{r.deduction.toFixed(2)}</span> : "—"}</td><td className="num">{pts(r.automated)}</td><td className="num font-semibold">{pts(r.total)}</td>
    <td><RatingStatus status={r.status} />{r.status !== "FINALIZED" && r.blockers.length > 0 && <span className="mt-1 block text-xs text-muted-foreground">{r.blockers.length} to resolve</span>}</td>
    <td className="text-right"><Link className="link text-sm" href={`/manage/ratings/${r.employee.id}?month=${month.slice(0, 7)}`}>{r.status === "FINALIZED" ? "View" : "Review"}<span className="sr-only"> {r.employee.legalName}</span></Link></td>
  </tr>)}</tbody></table></TableContainer>;
}
type RankRow = { employeeId: string; name: string; number: string; department: string; manual: number; automated: number; total: number; rank?: number; months?: number; status?: string };
export function RankingTable({ rows, label, period }: { rows: RankRow[]; label: string; period: string }) {
  if (!rows.length) return <EmptyState icon={Trophy} title="No finalized ratings yet" description="Rankings use finalized monthly ratings only." />;
  return <TableContainer label={label} flush className="rounded-lg border"><table className="data-table min-w-[820px]"><thead><tr><th className="num">Rank</th><th>Employee</th><th>Department</th><th className="num">Rating /10</th><th className="num">Manual /5</th><th className="num">Automated /5</th><th>Period</th><th>Status</th></tr></thead><tbody>{rows.map(r => <tr key={r.employeeId}>
    <td className="num font-semibold">{r.rank ?? "—"}</td><td><Cell2 primary={r.name} secondary={r.number} /></td><td>{r.department}</td>
    <td className="num font-semibold">{r.total.toFixed(2)}</td><td className="num">{r.manual.toFixed(2)}</td><td className="num">{r.automated.toFixed(2)}</td>
    <td className="whitespace-nowrap">{period}{r.months !== undefined && r.months < 3 ? ` (${r.months} of 3 months)` : ""}</td><td><RatingStatus status={r.status ?? "FINALIZED"} /></td>
  </tr>)}</tbody></table></TableContainer>;
}
export const quarterLabel = (key: string) => `Q${key.slice(6)} ${key.slice(0, 4)}`;
export const monthLabel = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`));
