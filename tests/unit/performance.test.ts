import { describe, it, expect } from "vitest";
import { automatedScore, deductionMapping, defaultWarningDeductions, finalScores, quarterMonths, quarterOf, quarterSummary, rank, ratio, targetRatio, validManual, warningDeduction, workTimeRatio, weights } from "@/features/performance/policy";
// Pure scoring rules: manual 0-5, automated 0-5 (work time 2.50, tasks 1.25, targets 1.25), warnings, quarters, ranks.
describe("work time and ratios", () => {
  it("never divides by zero: nothing to measure is null, not zero", () => {
    expect(ratio(0, 0)).toBeNull(); expect(ratio(5, 0)).toBeNull(); expect(ratio(12600, 14400)).toBe(0.875); expect(ratio(20, 10)).toBe(1);
  });
  it("work time is 70 % minutes completed and 30 % days attended", () => {
    // 210 of 240 minutes on the only scheduled day, which was attended.
    expect(workTimeRatio(210 / 240, 1)).toBeCloseTo(0.7 * 0.875 + 0.3, 10);
    expect(workTimeRatio(null, 0.5)).toBe(0.5); expect(workTimeRatio(0.5, null)).toBe(0.5); expect(workTimeRatio(null, null)).toBeNull();
  });
});
describe("targets", () => {
  it("achievement is actual ÷ target, capped at 100 % per target, averaged", () => {
    expect(targetRatio([{ target: 100, actual: 80 }, { target: 20, actual: 30 }])).toEqual({ status: "COMPLETE", ratio: 0.9, awaiting: 0 });
    expect(targetRatio([{ target: 300, actual: 0 }])).toMatchObject({ status: "COMPLETE", ratio: 0 });
  });
  it("an awaited result is incomplete, never a zero; no valid targets is not applicable", () => {
    expect(targetRatio([{ target: 100, actual: 100 }, { target: 50, actual: null }])).toEqual({ status: "INCOMPLETE", ratio: null, awaiting: 1 });
    expect(targetRatio([])).toMatchObject({ status: "NOT_APPLICABLE", ratio: null });
    expect(targetRatio([{ target: 0, actual: 5 }, { target: -1, actual: 5 }])).toMatchObject({ status: "NOT_APPLICABLE" });
  });
});
describe("automated score", () => {
  it("uses the documented weights and adds up to at most 5", () => {
    expect(weights.workTime + weights.tasks + weights.targets).toBe(5);
    const all = automatedScore([{ key: "workTime", status: "COMPLETE", ratio: 0.88 }, { key: "tasks", status: "COMPLETE", ratio: 0.88 }, { key: "targets", status: "COMPLETE", ratio: 0.72 }]);
    expect(all.components.map(c => [c.max, c.points])).toEqual([[2.5, 2.2], [1.25, 1.1], [1.25, 0.9]]);
    expect(all).toMatchObject({ status: "READY", raw: 4.2 }); // the specification's illustrative 2.20 + 1.10 + 0.90
    const perfect = automatedScore([{ key: "workTime", status: "COMPLETE", ratio: 1 }, { key: "tasks", status: "COMPLETE", ratio: 1 }, { key: "targets", status: "COMPLETE", ratio: 1 }]);
    expect(perfect.raw).toBe(5);
  });
  it("redistributes a Not applicable component's weight proportionally (no automatic zero)", () => {
    const noTasks = automatedScore([{ key: "workTime", status: "COMPLETE", ratio: 1 }, { key: "tasks", status: "NOT_APPLICABLE", ratio: null }, { key: "targets", status: "COMPLETE", ratio: 1 }]);
    expect(noTasks.components.map(c => c.max)).toEqual([3.33, 0, 1.67]);
    expect(noTasks.raw).toBe(5);
  });
  it("is not ready while any input is incomplete, and has no score without any measurable data", () => {
    expect(automatedScore([{ key: "workTime", status: "INCOMPLETE", ratio: null }, { key: "tasks", status: "COMPLETE", ratio: 1 }, { key: "targets", status: "NOT_APPLICABLE", ratio: null }])).toMatchObject({ status: "INCOMPLETE", raw: null });
    expect(automatedScore([{ key: "workTime", status: "NOT_APPLICABLE", ratio: null }, { key: "tasks", status: "NOT_APPLICABLE", ratio: null }, { key: "targets", status: "NOT_APPLICABLE", ratio: null }])).toMatchObject({ status: "NO_DATA", raw: null });
  });
  it("a confirmed 30-minute shortfall lowers the work-time points", () => {
    const score = (minutes: number) => automatedScore([{ key: "workTime", status: "COMPLETE", ratio: workTimeRatio(minutes / 240, 1) }, { key: "tasks", status: "NOT_APPLICABLE", ratio: null }, { key: "targets", status: "NOT_APPLICABLE", ratio: null }]).raw!;
    expect(score(240)).toBe(5); expect(score(210)).toBe(4.56); // (0.7 × 0.875 + 0.3) × 5 = 4.5625
  });
});
describe("manual score, warnings and totals", () => {
  it("manual scores are 0-5 in steps of 0.5", () => {
    for (const ok of [0, 0.5, 2.5, 4, 5]) expect(validManual(ok)).toBe(true);
    for (const bad of [-0.5, 5.5, 3.3, Number.NaN, Infinity]) expect(validManual(bad)).toBe(false);
  });
  it("warning deductions follow the configured mapping and never push the automated score below zero", () => {
    expect(defaultWarningDeductions).toEqual({ NOTICE: 0.1, WARNING: 0.25, SERIOUS_WARNING: 0.5, FINAL_WARNING: 1 });
    expect(warningDeduction([{ severity: "WARNING" }, { severity: "NOTICE" }], defaultWarningDeductions)).toBe(0.35);
    expect(warningDeduction([{ severity: "WARNING" }], { ...defaultWarningDeductions, WARNING: 0.4 })).toBe(0.4);
    expect(finalScores(4, 4.2, 0.25)).toEqual({ automated: 3.95, total: 7.95 }); // the specification's illustrative month
    expect(finalScores(0, 0.5, 1)).toEqual({ automated: 0, total: 0 });
    expect(finalScores(5, 5, 0)).toEqual({ automated: 5, total: 10 });
  });
  it("an Admin mapping is validated: missing or invalid values fall back to the defaults", () => {
    expect(deductionMapping({ NOTICE: 0.2, WARNING: "x", SERIOUS_WARNING: -1, FINAL_WARNING: 9 })).toEqual({ NOTICE: 0.2, WARNING: 0.25, SERIOUS_WARNING: 0.5, FINAL_WARNING: 1 });
    expect(deductionMapping(null)).toEqual(defaultWarningDeductions);
  });
});
describe("quarters and ranking", () => {
  it("calendar quarters", () => {
    expect(quarterOf("2030-02-01")).toEqual({ year: 2030, quarter: 1 }); expect(quarterOf("2030-10-01")).toEqual({ year: 2030, quarter: 4 });
    expect(quarterMonths(2030, 3)).toEqual(["2030-07-01", "2030-08-01", "2030-09-01"]);
  });
  it("the quarter is the average of finalized monthly totals (0-10), provisional until all three are final", () => {
    expect(quarterSummary([{ manual: 4, automated: 3.5, total: 7.5 }, { manual: 4, automated: 4, total: 8 }, { manual: 4.5, automated: 4, total: 8.5 }])).toEqual({ months: 3, manual: 4.17, automated: 3.83, total: 8, status: "FINAL" });
    expect(quarterSummary([{ manual: 4, automated: 3.5, total: 7.5 }, { manual: 4, automated: 4, total: 8 }])).toMatchObject({ months: 2, total: 7.75, status: "PROVISIONAL" });
    expect(quarterSummary([])).toBeNull();
  });
  it("ranks highest first; equal totals share a rank and the next rank skips (1, 1, 3)", () => {
    const ranked = rank([{ name: "B", total: 8 }, { name: "A", total: 9 }, { name: "C", total: 8 }, { name: "D", total: 7.5 }, { name: "E", total: 7.5 }, { name: "F", total: 7.5 }, { name: "G", total: 2 }]);
    expect(ranked.map(r => [r.name, r.rank])).toEqual([["A", 1], ["B", 2], ["C", 2], ["D", 4], ["E", 4], ["F", 4], ["G", 7]]);
  });
});
