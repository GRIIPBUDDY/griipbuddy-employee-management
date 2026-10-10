"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getIdentity, assertMutationOrigin } from "@/lib/auth/request";
import { safeMessage } from "@/lib/utils/errors";
import type { ActionState } from "@/types/auth";
import { createEmployee, updateEmployee, updateOwnContact, updateEmployment, deactivateEmployee } from "./service";
import { createWorkRecord, correctWorkRecord, deleteWorkRecord } from "./timeline";
import { deleteDocument, updateDocumentVisibility } from "./documents";

function text(form: FormData, key: string) { return String(form.get(key) ?? ""); }
async function profilePersonal(form: FormData) {
  return Object.fromEntries(["employeeNumber", "legalName", "preferredName", "dateOfBirth", "gender", "nationality", "phone", "address", "emergencyName", "emergencyPhone", "emergencyRelationship"].map(key => [key, text(form, key)]));
}
function contact(form: FormData) { return Object.fromEntries(["phone", "address", "emergencyName", "emergencyPhone", "emergencyRelationship"].map(key => [key, text(form, key)])); }
function employment(form: FormData) { return Object.fromEntries(["startDate", "endDate", "departmentLabel", "positionLabel", "departmentId", "positionId", "employmentType", "workLocation", "probationEndDate", "managerEmployeeId"].map(key => [key, text(form, key)])); }
function refresh() { revalidatePath("/manage/employees", "layout"); revalidatePath("/me", "layout"); revalidatePath("/dashboard"); }
export async function createEmployeeAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    await assertMutationOrigin();
    id = await createEmployee(await getIdentity(), { personal: await profilePersonal(form), employment: employment(form), userId: text(form, "userId"), email: text(form, "email"), temporaryPassword: text(form, "temporaryPassword") });
    refresh();
  } catch (error) { return { error: safeMessage(error) }; }
  redirect(`/manage/employees/${id}`);
}
export async function editEmployeeAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { await assertMutationOrigin(); await updateEmployee(await getIdentity(), { employeeId: text(form, "employeeId"), expectedUpdatedAt: text(form, "expectedUpdatedAt"), personal: await profilePersonal(form) }); refresh(); return { success: "Employee profile updated." }; }
  catch (error) { return { error: safeMessage(error) }; }
}
export async function ownContactAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { await assertMutationOrigin(); await updateOwnContact(await getIdentity(), contact(form)); refresh(); return { success: "Your contact information was updated." }; }
  catch (error) { return { error: safeMessage(error) }; }
}
export async function employmentAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { await assertMutationOrigin(); await updateEmployment(await getIdentity(), { employeeId: text(form, "employeeId"), periodId: text(form, "periodId"), revision: Number(form.get("revision")), employment: employment(form), reason: text(form, "reason") }); refresh(); return { success: "Employment information updated. Existing sessions have been revoked." }; }
  catch (error) { return { error: safeMessage(error) }; }
}
export async function deactivateAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { await assertMutationOrigin(); await deactivateEmployee(await getIdentity(), { employeeId: text(form, "employeeId"), reason: text(form, "reason") }); refresh(); return { success: "Employee deactivated. Documents and history have been preserved." }; }
  catch (error) { return { error: safeMessage(error) }; }
}
function record(form: FormData) { return { employeeId: text(form, "employeeId"), type: text(form, "type"), title: text(form, "title"), description: text(form, "description"), eventDate: text(form, "eventDate"), employeeVisible: form.get("employeeVisible") === "on" }; }
export async function recordAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { await assertMutationOrigin(); await createWorkRecord(await getIdentity(), record(form)); refresh(); return { success: "Work record created." }; }
  catch (error) { return { error: safeMessage(error) }; }
}
export async function correctRecordAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { await assertMutationOrigin(); await correctWorkRecord(await getIdentity(), { ...record(form), recordId: text(form, "recordId"), expectedUpdatedAt: text(form, "expectedUpdatedAt"), reason: text(form, "reason") }); refresh(); return { success: "Work record corrected; previous content is retained in the audit history." }; }
  catch (error) { return { error: safeMessage(error) }; }
}
export async function deleteRecordAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { await assertMutationOrigin(); await deleteWorkRecord(await getIdentity(), { employeeId: text(form, "employeeId"), recordId: text(form, "recordId"), reason: text(form, "reason") }); refresh(); return { success: "Work record removed from the timeline. History is retained." }; }
  catch (error) { return { error: safeMessage(error) }; }
}
export async function deleteDocumentAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { await assertMutationOrigin(); await deleteDocument(await getIdentity(), { employeeId: text(form, "employeeId"), documentId: text(form, "documentId"), reason: text(form, "reason") }); refresh(); return { success: "Document access removed. Its historical metadata and bytes are retained." }; }
  catch (error) { return { error: safeMessage(error) }; }
}

export async function documentVisibilityAction(_: ActionState, form: FormData): Promise<ActionState> {
  try { await assertMutationOrigin(); await updateDocumentVisibility(await getIdentity(), { employeeId: text(form, "employeeId"), documentId: text(form, "documentId"), employeeVisible: form.get("employeeVisible") === "on", reason: text(form, "reason") }); refresh(); return { success: "Document access updated." }; }
  catch (error) { return { error: safeMessage(error) }; }
}
