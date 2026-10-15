import { decimal } from "@/features/pay/money";
/**
 * Monthly performance scoring rules, kept in one place. Every number here is a documented company setting:
 *  - manual assessment 0-5 in steps of 0.5 (Admin/HR), automated assessment 0-5 (this file), total 0-10;
 *  - automated weights: work time 2.50 (70 % scheduled minutes completed, 30 % scheduled days attended), tasks 1.25,
 *    targets 1.25. A component without data is Not applicable and its weight is shared proportionally by the others;
 *  - confirmed warnings deduct from the automated score only (amounts configurable in Settings), never below zero.
 */
export const weights = { workTime: 2.5, tasks: 1.25, targets: 1.25 } as const;
export const workTimeSplit = { minutes: 0.7, days: 0.3 } as const;
export const manualStep = 0.5;
/** A manual score at or below this needs a written explanation. */
export const explainAtOrBelow = 2;
export const defaultWarningDeductions = { NOTICE: 0.1, WARNING: 0.25, SERIOUS_WARNING: 0.5, FINAL_WARNING: 1 } as const;
export type WarningSeverity = keyof typeof defaultWarningDeductions;
export const severityLabels: Record<WarningSeverity, string> = { NOTICE: "Notice", WARNING: "Warning", SERIOUS_WARNING: "Serious warning", FINAL_WARNING: "Final warning" };
export type ComponentKey = keyof typeof weights;
export const componentLabels: Record<ComponentKey, string> = { workTime: "Work time and attendance", tasks: "Assigned tasks", targets: "Targets" };
export type ComponentStatus = "COMPLETE" | "INCOMPLETE" | "NOT_APPLICABLE";
export type ComponentInput = { key: ComponentKey; status: ComponentStatus; ratio: number | null; reason?: string };
const round2 = (value: number | string) => Number(decimal(value).toDecimalPlaces(2).toFixed(2));
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
/** Share of a whole, or null when there is nothing to measure (never a division by zero). */
export const ratio = (part: number, whole: number) => whole > 0 ? clamp01(part / whole) : null;
/** Work-time ratio: 70 % minutes completed, 30 % days attended; one missing part leaves the other at full weight. */
export function workTimeRatio(minutes: number | null, days: number | null) {
  if (minutes === null && days === null) return null;
  if (minutes === null) return days; if (days === null) return minutes;
  return workTimeSplit.minutes * minutes + workTimeSplit.days * days;
}
/** Target achievement per target is actual ÷ target, capped at 100 %; the component is the plain average. */
export function targetRatio(targets: { target: number; actual: number | null }[]) {
  const valid = targets.filter(t => t.target > 0);
  if (!valid.length) return { status: "NOT_APPLICABLE" as const, ratio: null, awaiting: 0 };
  const awaiting = valid.filter(t => t.actual === null).length;
  if (awaiting) return { status: "INCOMPLETE" as const, ratio: null, awaiting };
  return { status: "COMPLETE" as const, ratio: valid.reduce((sum, t) => sum + clamp01(t.actual! / t.target), 0) / valid.length, awaiting: 0 };
}
/**
 * Scales applicable components to 5 points. Each component's points are rounded to two decimals and the raw total is
 * their sum, so the displayed breakdown always adds up. INCOMPLETE anywhere means the score is not ready.
 */
export function automatedScore(components: ComponentInput[]) {
  const applicable = components.filter(c => c.status !== "NOT_APPLICABLE"), share = applicable.reduce((sum, c) => sum + weights[c.key], 0);
  const status = components.some(c => c.status === "INCOMPLETE") ? "INCOMPLETE" : applicable.length ? "READY" : "NO_DATA";
  const rows = components.map(c => {
    const max = c.status === "NOT_APPLICABLE" || !share ? 0 : round2(weights[c.key] * 5 / share);
    return { ...c, label: componentLabels[c.key], weight: weights[c.key], max, points: c.status === "COMPLETE" && c.ratio !== null ? round2(c.ratio * weights[c.key] * 5 / share) : null };
  });
  const raw = status === "READY" ? Math.min(5, round2(rows.reduce((sum, r) => sum + (r.points ?? 0), 0))) : null;
  return { status, components: rows, raw };
}
export function warningDeduction(warnings: { severity: string }[], mapping: Record<string, number>) {
  return round2(warnings.reduce((sum, w) => sum + (mapping[w.severity] ?? 0), 0));
}
/** Final automated score never falls below zero; the monthly total is manual + final automated (0-10). */
export function finalScores(manual: number, raw: number, deduction: number) {
  const automated = round2(Math.max(0, raw - deduction));
  return { automated, total: round2(manual + automated) };
}
export function validManual(score: number) { return Number.isFinite(score) && score >= 0 && score <= 5 && Number.isInteger(score / manualStep); }
/** Validates an Admin-supplied deduction mapping: every severity present, 0-5 points, at most two decimals. */
export function deductionMapping(value: unknown): Record<WarningSeverity, number> {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries((Object.keys(defaultWarningDeductions) as WarningSeverity[]).map(key => {
    const n = Number(source[key] ?? defaultWarningDeductions[key]);
    return [key, Number.isFinite(n) && n >= 0 && n <= 5 ? round2(n) : defaultWarningDeductions[key]];
  })) as Record<WarningSeverity, number>;
}
/** Calendar quarter of a month key (YYYY-MM-01) and its three months. */
export function quarterOf(month: string) { const [y, m] = month.split("-").map(Number); return { year: y, quarter: Math.ceil(m / 3) }; }
export function quarterMonths(year: number, quarter: number) { return [0, 1, 2].map(i => `${year}-${String((quarter - 1) * 3 + 1 + i).padStart(2, "0")}-01`); }
/**
 * Quarterly rating = average of the finalized monthly totals (0-10, never a 30-point sum). Warning deductions are
 * already inside each monthly automated score and are not applied again. Missing months are not zeros: the quarter
 * stays Provisional until all three months are finalized.
 */
export function quarterSummary(months: { manual: number; automated: number; total: number }[]) {
  if (!months.length) return null;
  const avg = (pick: (m: typeof months[number]) => number) => round2(months.reduce((sum, m) => sum + pick(m), 0) / months.length);
  return { months: months.length, manual: avg(m => m.manual), automated: avg(m => m.automated), total: avg(m => m.total), status: months.length === 3 ? "FINAL" as const : "PROVISIONAL" as const };
}
/** Standard competition ranking: equal scores share a rank and the next rank skips (1, 1, 3). */
export function rank<T extends { total: number; name: string }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return sorted.map((row, index) => ({ ...row, rank: index && sorted[index - 1].total === row.total ? 0 : index + 1 }))
    .map((row, index, all) => ({ ...row, rank: row.rank || all.slice(0, index).reverse().find(r => r.rank)!.rank }));
}
