"use server";
import { revalidatePath } from "next/cache";
import { getIdentity, assertMutationOrigin } from "@/lib/auth/request";
import { safeMessage } from "@/lib/utils/errors";
import type { ActionState } from "@/types/auth";
import { publishSchedule } from "./schedules";
import { checkIn, checkOut } from "./attendance";
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
function minute(time: string) { if (!/^\d{2}:\d{2}$/.test(time)) return NaN; const [hour, minute] = time.split(":").map(Number); return hour <= 23 && minute <= 59 ? hour * 60 + minute : NaN; }
function refresh() { revalidatePath("/me", "layout"); revalidatePath("/manage", "layout"); }
export async function publishAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertMutationOrigin();
    await publishSchedule(await getIdentity(), {
      ...Object.fromEntries(["employeeId", "employmentPeriodId", "effectiveFrom", "effectiveUntil", "label", "reason", "baseScheduleId"].map(k => [k, text(form, k)])),
      ...(form.has("baseRevision") ? { baseRevision: Number(form.get("baseRevision")) } : {}),
      holidayWorkRequired: form.get("holidayWorkRequired") === "on",
      slots: form.getAll("slotKey").map(key => ({ weekday: Number(form.get(`weekday-${key}`)),
        startMinute: minute(text(form, `start-${key}`)), endMinute: minute(text(form, `end-${key}`)), endDayOffset: Number(form.get(`endday-${key}`)) })),
      ...(form.get("restorePrevious") === "on" ? { restoreSlots: JSON.parse(text(form, "restoreSlots")) } : {}),
    });
    refresh(); return { success: "Schedule published. Previous assignments and attendance context are preserved." };
  } catch (error) { return { error: safeMessage(error) }; }
}
export async function checkinAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { await assertMutationOrigin(); await checkIn(await getIdentity(), { slotId: text(form, "slotId"), workDate: text(form, "workDate"), operationKey: text(form, "operationKey") }); refresh(); return { success: "You are checked in." }; }
  catch (error) { return { error: safeMessage(error) }; }
}
export async function checkoutAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { await assertMutationOrigin(); await checkOut(await getIdentity(), { sessionId: text(form, "sessionId"), operationKey: text(form, "operationKey") }); refresh(); return { success: "You are checked out. Your actual session is recorded." }; }
  catch (error) { return { error: safeMessage(error) }; }
}
