import { Temporal } from "@js-temporal/polyfill";
// Shared date-filter semantics for every list and report.
// The UI always speaks in inclusive organization-local dates ("to"); services keep exclusive "until" bounds.
// Legacy links using an exclusive `until` remain supported.
export const rangeModes = ["today", "date", "week", "month", "custom", "all"] as const;
export type RangeMode = (typeof rangeModes)[number];
export type ResolvedRange = { mode: RangeMode; from: string; to: string; until: string; label: string; error?: string } | { mode: "all"; from?: undefined; to?: undefined; until?: undefined; label: string; error?: string };
type Query = Record<string, string | string[] | undefined>;
const text = (query: Query, key: string) => { const value = query[key]; return typeof value === "string" ? value : ""; };
export function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try { return Temporal.PlainDate.from(value, { overflow: "reject" }).toString() === value; } catch { return false; }
}
const add = (date: string, days: number) => Temporal.PlainDate.from(date).add({ days }).toString();
const days = (from: string, to: string) => Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to)).days;
const format = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(new Date(`${date}T00:00:00Z`));
export function rangeLabel(from: string, to: string) {
  if (from === to) return format(from, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${format(from, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })} – ${format(to, { day: "numeric", month: "short", year: "numeric" })}`;
}
export function weekStartOf(date: string, weekStartDay = 1) { return add(date, -((Temporal.PlainDate.from(date).dayOfWeek - weekStartDay + 7) % 7)); }
export function resolveRange(query: Query, today: string, options: { defaultMode?: RangeMode; weekStartDay?: number; maxDays?: number; allowAll?: boolean } = {}): ResolvedRange {
  const { defaultMode = "today", weekStartDay = 1, maxDays, allowAll = false } = options;
  const requested = text(query, "range") as RangeMode, legacy = ["from", "to", "until"].some(key => text(query, key));
  let mode: RangeMode = rangeModes.includes(requested) ? requested : legacy ? "custom" : defaultMode;
  if (mode === "all" && !allowAll) mode = "today";
  if (mode === "all") return { mode, label: "All dates" };
  const anchor = isDate(text(query, "date")) ? text(query, "date") : today;
  let from = today, to = today, error: string | undefined;
  if (mode === "date") { from = to = anchor; }
  else if (mode === "week") { from = weekStartOf(anchor, weekStartDay); to = add(from, 6); }
  else if (mode === "month") { from = `${anchor.slice(0, 7)}-01`; to = add(Temporal.PlainDate.from(from).add({ months: 1 }).toString(), -1); }
  else if (mode === "custom") {
    const start = text(query, "from"), end = text(query, "to"), until = text(query, "until");
    if (start && !isDate(start) || end && !isDate(end) || until && !isDate(until)) error = "Enter valid dates.";
    from = isDate(start) ? start : today;
    to = isDate(end) ? end : isDate(until) ? add(until, -1) : from;
    if (to < from) { error = "The end date must be on or after the start date."; to = from; }
  }
  if (maxDays && days(from, to) + 1 > maxDays) { error = `Choose a range of at most ${maxDays} days.`; to = add(from, maxDays - 1); }
  return { mode, from, to, until: add(to, 1), label: rangeLabel(from, to), error };
}
/** Query parameters that reproduce a resolved range, for pagination and export links. */
export function rangeQuery(range: ResolvedRange): Record<string, string> {
  if (range.mode === "all") return { range: "all" };
  return range.mode === "custom" ? { range: "custom", from: range.from, to: range.to } : range.mode === "today" ? { range: "today" } : { range: range.mode, date: range.from };
}
