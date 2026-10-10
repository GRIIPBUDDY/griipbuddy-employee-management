import { AppError } from "@/lib/utils/errors";
import { addDays, dateKey, localInstant, dayStart, weekday } from "./dates";
import type { SlotInput } from "./validation";
export type SchedulePattern = {
  id: string; employeeId: string; employmentPeriodId: string; effectiveFrom: Date; effectiveUntil: Date | null; label: string | null; supersededAt: Date | null;
  slots: (SlotInput & { id: string })[]; employmentPeriod: { startDate: Date; endDate: Date | null };
};
export type Occurrence = { slotId: string; scheduleId: string; employmentPeriodId: string; workDate: string; label: string | null; scheduledStartAt: Date; scheduledEndAt: Date; eligibleEndAt: Date; earliestCheckinAt: Date; };
export function validatePattern(slots: SlotInput[]) {
  const spans = [-10080, 0, 10080].flatMap(offset => slots.map(s => ({ start: offset + (s.weekday - 1) * 1440 + s.startMinute, end: offset + (s.weekday - 1) * 1440 + s.endMinute + s.endDayOffset * 1440 }))).sort((a, b) => a.start - b.start);
  for (let i = 1; i < spans.length; i++) if (spans[i].start < spans[i - 1].end) throw new AppError(409, "SCHEDULE_OVERLAP", "Scheduled periods overlap, including overnight or Sunday/Monday boundaries.");
}
export function occurrence(schedule: SchedulePattern, slot: SlotInput & { id: string }, date: string, timezone: string, earlyMinutes: number): Occurrence | null {
  if (schedule.supersededAt || date < dateKey(schedule.effectiveFrom) || schedule.effectiveUntil && date >= dateKey(schedule.effectiveUntil) || slot.weekday !== weekday(date)) return null;
  const stint = schedule.employmentPeriod;
  if (date < dateKey(stint.startDate) || stint.endDate && date >= dateKey(stint.endDate)) return null;
  const scheduledStartAt = localInstant(date, slot.startMinute, timezone), scheduledEndAt = localInstant(addDays(date, slot.endDayOffset), slot.endMinute, timezone);
  if (scheduledEndAt <= scheduledStartAt) throw new AppError(409, "SCHEDULE_TIME", "This timezone transition makes the scheduled period invalid. Contact HR.");
  const boundary = stint.endDate ? dayStart(dateKey(stint.endDate), timezone) : null;
  const eligibleEndAt = boundary && boundary < scheduledEndAt ? boundary : scheduledEndAt;
  return { slotId: slot.id, scheduleId: schedule.id, employmentPeriodId: schedule.employmentPeriodId, workDate: date, label: schedule.label,
    scheduledStartAt, scheduledEndAt, eligibleEndAt, earliestCheckinAt: new Date(scheduledStartAt.getTime() - earlyMinutes * 60000) };
}
export function checkinEligibility(value: Occurrence, now: Date) {
  if (now < value.earliestCheckinAt) return { allowed: false, reason: "Check-in opens at the configured early window. Please wait." };
  if (now > value.eligibleEndAt) return { allowed: false, reason: "This scheduled period has ended. Contact HR for a reviewed correction or exception." };
  return { allowed: true, reason: "Ready to check in." };
}
export function validateVersionBoundaries(patterns: SchedulePattern[]) {
  const sorted = patterns.filter(p => !p.supersededAt).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  for (let i = 1; i < sorted.length; i++) {
    const left = sorted[i - 1], right = sorted[i];
    if (!left.effectiveUntil || left.effectiveUntil > right.effectiveFrom) throw new AppError(409, "SCHEDULE_OVERLAP", "Effective schedule assignments overlap. Choose a future replacement of the existing assignment.");
    if (dateKey(left.effectiveUntil) !== dateKey(right.effectiveFrom) || left.employmentPeriod.endDate && left.employmentPeriod.endDate <= right.effectiveFrom) continue;
    const day = dateKey(right.effectiveFrom), prior = addDays(day, -1);
    for (const a of left.slots.filter(s => s.weekday === weekday(prior) && s.endDayOffset === 1)) {
      for (const b of right.slots.filter(s => s.weekday === weekday(day))) if (a.endMinute > b.startMinute) throw new AppError(409, "SCHEDULE_OVERLAP", "The previous overnight period overlaps the first day of the new assignment.");
    }
  }
}
