"use server";
import { revalidatePath } from "next/cache";
import { getIdentity, assertMutationOrigin } from "@/lib/auth/request";
import { safeMessage } from "@/lib/utils/errors";
import type { ActionState } from "@/types/auth";
import { publishSchedule } from "./schedules";
import { checkIn, checkOut,checkInUnscheduled } from "./attendance";
import { timeMinutes } from "./schedule-draft";
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
function refresh() { revalidatePath("/me", "layout"); revalidatePath("/manage", "layout"); }
export async function publishAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertMutationOrigin();
    await publishSchedule(await getIdentity(), {
      ...Object.fromEntries(["employeeId", "employmentPeriodId", "effectiveFrom", "effectiveUntil", "label", "reason", "baseScheduleId"].map(k => [k, text(form, k)])),
      ...(form.has("baseRevision") ? { baseRevision: Number(form.get("baseRevision")) } : {}),
      duration:text(form,"duration")||"CUSTOM",editScope:text(form,"editScope")||"CUSTOM",
      holidayWorkRequired: form.get("holidayWorkRequired") === "on",
      slots: form.getAll("slotKey").map(key => ({ weekday: Number(form.get(`weekday-${key}`)),
        startMinute: timeMinutes(text(form, `start-${key}`)), endMinute: timeMinutes(text(form, `end-${key}`)), endDayOffset: Number(form.get(`endday-${key}`)) })),
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

export async function unscheduledAction(_:ActionState,form:FormData):Promise<ActionState>{try{await assertMutationOrigin();await checkInUnscheduled(await getIdentity(),{operationKey:text(form,"operationKey")});refresh();return {success:"Unscheduled session started. Payable overtime requires staff approval."};}catch(e){return {error:safeMessage(e)};}}
