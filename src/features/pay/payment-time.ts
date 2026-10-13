import { Temporal } from "@js-temporal/polyfill";
import { AppError } from "@/lib/utils/errors";
// A browser datetime-local value is organization-local wall time; an explicit ISO offset is also accepted.
export function paymentInstant(input: string, timezone: string): string {
  const value = input.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(new Date(value).getTime())) return new Date(value).toISOString();
  try {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) throw new Error("format");
    const plain = Temporal.PlainDateTime.from(value, { overflow: "reject" }), zoned = plain.toZonedDateTime(timezone, { disambiguation: "earlier" });
    if (!zoned.toPlainDateTime().equals(plain)) throw new Error("gap");
    return new Date(Number(zoned.epochMilliseconds)).toISOString();
  } catch { throw new AppError(400, "PAYMENT_DATE", "Enter a valid payment date and time."); }
}
