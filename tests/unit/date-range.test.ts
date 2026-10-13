import { it, expect } from "vitest";
import { resolveRange, rangeQuery, weekStartOf, isDate } from "@/lib/utils/date-range";
import { paymentInstant } from "@/features/pay/payment-time";
const today = "2026-10-13";
it("defaults to today's organization-local date only", () => {
  expect(resolveRange({}, today)).toMatchObject({ mode: "today", from: today, to: today, until: "2026-10-14" });
});
it("selects exactly one specific date", () => {
  expect(resolveRange({ range: "date", date: "2026-10-05" }, today)).toMatchObject({ from: "2026-10-05", to: "2026-10-05", until: "2026-10-06" });
});
it("treats the UI 'to' date as inclusive and keeps legacy exclusive 'until' links working", () => {
  expect(resolveRange({ range: "custom", from: "2026-10-01", to: "2026-10-03" }, today)).toMatchObject({ until: "2026-10-04" });
  expect(resolveRange({ from: "2026-10-01", until: "2026-10-04" }, today)).toMatchObject({ mode: "custom", to: "2026-10-03", until: "2026-10-04" });
  // A start date alone is a single day, never the previously selected wide range.
  expect(resolveRange({ from: "2026-10-07" }, today)).toMatchObject({ to: "2026-10-07", until: "2026-10-08" });
});
it("reports reversed, invalid and oversized ranges instead of silently widening them", () => {
  expect(resolveRange({ range: "custom", from: "2026-10-05", to: "2026-10-01" }, today).error).toMatch(/on or after/);
  expect(resolveRange({ from: "2026-10-05", until: "2026-10-05" }, today).error).toMatch(/on or after/);
  expect(resolveRange({ range: "custom", from: "2026-02-30" }, today).error).toMatch(/valid/);
  const wide = resolveRange({ range: "custom", from: "2026-09-01", to: "2026-10-31" }, today, { maxDays: 31 });
  expect(wide.error).toMatch(/at most 31/); expect(wide.to).toBe("2026-10-01");
});
it("resolves week and month presets around the chosen date using the configured week start", () => {
  expect(resolveRange({ range: "week", date: "2026-10-15" }, today)).toMatchObject({ from: "2026-10-12", to: "2026-10-18" });
  expect(resolveRange({ range: "week", date: "2026-10-15" }, today, { weekStartDay: 7 })).toMatchObject({ from: "2026-10-11", to: "2026-10-17" });
  expect(resolveRange({ range: "month", date: "2028-02-10" }, today)).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
  expect(weekStartOf("2026-10-18")).toBe("2026-10-12");
});
it("supports an explicit all-dates mode only where allowed", () => {
  expect(resolveRange({ range: "all" }, today, { allowAll: true }).mode).toBe("all");
  expect(resolveRange({ range: "all" }, today).mode).toBe("today");
  expect(resolveRange({}, today, { defaultMode: "all", allowAll: true }).from).toBeUndefined();
});
it("round-trips ranges into pagination/export query parameters", () => {
  for (const q of [{ range: "date", date: "2026-10-05" }, { range: "custom", from: "2026-10-01", to: "2026-10-09" }, { range: "week", date: "2026-10-12" }]) {
    const r = resolveRange(q, today); expect(resolveRange(rangeQuery(r), today)).toMatchObject({ from: r.from, to: r.to });
  }
  expect(isDate("2026-13-01")).toBe(false); expect(isDate("2026-12-31")).toBe(true);
});
it("records payment times as organization-local wall time with explicit validation", () => {
  expect(paymentInstant("2026-11-05T10:30", "Asia/Dhaka")).toBe("2026-11-05T04:30:00.000Z");
  expect(paymentInstant("2026-11-05T10:30:15", "Asia/Dhaka")).toBe("2026-11-05T04:30:15.000Z");
  expect(paymentInstant("2026-11-05T10:30:00+06:00", "UTC")).toBe("2026-11-05T04:30:00.000Z");
  for (const bad of ["", "not a date", "2026-11-31T10:00", "05/11/2026 10:30"]) expect(() => paymentInstant(bad, "Asia/Dhaka")).toThrow(/valid payment date/);
});
it("condenses per-date pay blockers into readable ranges without losing distinct messages", async () => {
  const { summarizeBlockers } = await import("@/features/pay/blockers");
  const days = Array.from({ length: 31 }, (_, i) => `Compensation coverage missing or overlapping on 2026-08-${String(i + 1).padStart(2, "0")}`);
  expect(summarizeBlockers([...days, "Missing checkout"])).toEqual(["Missing checkout", "Compensation coverage missing or overlapping on 2026-08-01 – 2026-08-31 (31 dates)"]);
  expect(summarizeBlockers(["X on 2026-08-01", "X on 2026-08-03", "X on 2026-08-04", "X on 2026-08-01"])).toEqual(["X on 2026-08-01, 2026-08-03 – 2026-08-04 (3 dates)"]);
});
