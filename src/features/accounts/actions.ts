"use server";
import { signInWithPolicy, signOut } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertMutationOrigin, getIdentity } from "@/lib/auth/request";
import { loginSchema } from "@/lib/validation/schemas";
import { safeMessage } from "@/lib/utils/errors";
import { createAccount, updateAccountSecurity, resetPassword, changeOwnPassword } from "./service";
import type { ActionState } from "@/types/auth";

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const input = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!input.success) return { error: "Enter a valid email and password." };
  try {
    await assertMutationOrigin();
    await signInWithPolicy(input.data, form.get("remember") === "on");
  } catch (error) {
    if (error instanceof AuthError) return { error: "Email or password was not accepted. Try again or contact an administrator." };
    return { error: safeMessage(error) };
  }
  redirect("/dashboard");
}
export async function logoutAction() {
  await assertMutationOrigin();
  await signOut({ redirectTo: "/login" });
}
export async function passwordAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertMutationOrigin();
    await changeOwnPassword(await getIdentity(), { currentPassword: form.get("currentPassword"), password: form.get("password"), confirmPassword: form.get("confirmPassword") });
  } catch (error) { return { error: safeMessage(error) }; }
  await signOut({ redirectTo: "/login?changed=1" });
  return {};
}
export async function createAccountAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertMutationOrigin();
    await createAccount(await getIdentity(), { email: form.get("email"), displayName: form.get("displayName"), role: form.get("role"), temporaryPassword: form.get("temporaryPassword"),
      createEmployee: form.get("createEmployee") === "on", employeeNumber: form.get("employeeNumber") ?? "", legalName: form.get("legalName") ?? "",
      startDate: form.get("startDate") ?? "", departmentLabel: form.get("departmentLabel") ?? "", positionLabel: form.get("positionLabel") ?? "" });
    revalidatePath("/manage/accounts");
    return { success: "Account created. Share the temporary password through your verified staff channel. It expires in 24 hours." };
  } catch (error) { return { error: safeMessage(error) }; }
}
export async function securityAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertMutationOrigin();
    await updateAccountSecurity(await getIdentity(), { userId: form.get("userId"), role: form.get("role"), isActive: form.get("isActive") === "on",
      canManageCommissions: form.get("canManageCommissions") === "on", preorderCommissionEnabled: form.get("preorderCommissionEnabled") === "on" });
    revalidatePath("/manage/accounts");
    return { success: "Account security updated. Existing sessions have been revoked." };
  } catch (error) { return { error: safeMessage(error) }; }
}
export async function resetPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertMutationOrigin();
    await resetPassword(await getIdentity(), { userId: form.get("userId"), temporaryPassword: form.get("temporaryPassword") });
    return { success: "Temporary password reset. Existing sessions have been revoked." };
  } catch (error) { return { error: safeMessage(error) }; }
}
