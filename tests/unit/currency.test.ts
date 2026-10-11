import { describe, expect, it } from "vitest";
import { formatMoney } from "@/features/pay/currency";
describe("exact recorded-currency display", () => {
  it("defaults to Bangladeshi Taka with local grouping and half-up cents", () => {
    expect(formatMoney("123456.785")).toBe("৳ 1,23,456.79");
    expect(formatMoney("-0.005")).toBe("-৳ 0.01");
    expect(formatMoney("0")).toBe("৳ 0.00");
  });
  it("preserves cents beyond floating point precision and four-decimal inputs", () => {
    expect(formatMoney("9007199254740993.01")).toBe("৳ 9,00,71,99,25,47,40,993.01");
    expect(formatMoney("1.23455", "BDT", 4)).toBe("৳ 1.2346");
  });
  it("formats the captured currency without converting the amount", () => {
    expect(formatMoney("123.45", "USD")).toBe("USD 123.45");
    expect(formatMoney("123.45", "BDT")).toBe("৳ 123.45");
  });
});
