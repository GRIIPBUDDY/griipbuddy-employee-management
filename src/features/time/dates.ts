import { Temporal } from "@js-temporal/polyfill";
import { AppError } from "@/lib/utils/errors";
export const dateKey = (date: Date) => date.toISOString().slice(0, 10);
export const dateValue = (date: string) => new Date(`${date}T00:00:00.000Z`);
export function localDate(now: Date, timezone: string) { return Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(timezone).toPlainDate().toString(); }
export function addDays(date: string, days: number) { return Temporal.PlainDate.from(date).add({ days }).toString(); }
export function weekday(date: string) { return Temporal.PlainDate.from(date).dayOfWeek; }
export function weekStart(date: string) { return addDays(date, 1 - weekday(date)); }
export function minuteLabel(minute: number) { return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`; }
export function dayStart(date: string, timezone: string) { return new Date(Number(Temporal.PlainDate.from(date).toZonedDateTime(timezone).epochMilliseconds)); }
export function localInstant(date: string, minute: number, timezone: string) {
  const plain = Temporal.PlainDate.from(date).toPlainDateTime({ hour: Math.floor(minute / 60), minute: minute % 60 });
  const zoned = plain.toZonedDateTime(timezone, { disambiguation: "earlier" });
  if (!zoned.toPlainDateTime().equals(plain)) throw new AppError(409, "SCHEDULE_TIME", "This scheduled local time does not exist because of a timezone transition. Contact HR.");
  return new Date(Number(zoned.epochMilliseconds));
}
export function displayInstant(date: Date, timezone: string) { return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(date); }
export function displayTime(date: Date, timezone: string) { return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date); }
export function durationLabel(seconds: number) { const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60); return `${hours}h ${minutes}m ${seconds % 60}s`; }
