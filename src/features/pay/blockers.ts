import { Temporal } from "@js-temporal/polyfill";
// Condenses per-date blocker messages ("X on 2026-08-01", "X on 2026-08-02", …) into readable date ranges.
export function summarizeBlockers(blockers: readonly string[]): string[] {
  const dated = new Map<string, string[]>(), other: string[] = [];
  for (const blocker of new Set(blockers)) { const m = blocker.match(/^(.*) on (\d{4}-\d{2}-\d{2})$/); if (m) dated.set(m[1], [...(dated.get(m[1]) ?? []), m[2]]); else other.push(blocker); }
  const result = [...other];
  for (const [message, dates] of dated) {
    const sorted = [...dates].sort(), ranges: string[] = [];
    let start = sorted[0], end = sorted[0];
    for (const date of sorted.slice(1)) { if (Temporal.PlainDate.from(end).add({ days: 1 }).toString() === date) end = date; else { ranges.push(start === end ? start : `${start} – ${end}`); start = end = date; } }
    ranges.push(start === end ? start : `${start} – ${end}`);
    result.push(`${message} on ${ranges.join(", ")}${sorted.length > 1 ? ` (${sorted.length} dates)` : ""}`);
  }
  return result;
}
