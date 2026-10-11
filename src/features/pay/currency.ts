import { decimal } from "./money";

/** Format decimal strings directly: converting payroll totals to Number loses cents. */
export function formatMoney(value: string, currency = "BDT", digits = 2): string {
  const rounded = decimal(value).toFixed(digits);
  const [whole, fraction] = rounded.replace(/^-/, "").split(".");
  const grouped = new Intl.NumberFormat(currency === "BDT" ? "bn-BD-u-nu-latn" : "en-BD", { maximumFractionDigits: 0 }).format(BigInt(whole));
  const symbol = currency === "BDT" ? "৳" : currency;
  return `${rounded.startsWith("-") ? "-" : ""}${symbol} ${grouped}${fraction ? `.${fraction}` : ""}`;
}
