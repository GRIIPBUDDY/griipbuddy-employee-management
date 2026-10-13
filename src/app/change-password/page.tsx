import { pageActor } from "@/lib/auth/request";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { AuthFrame } from "@/components/layout/auth-frame";
import { passwordAction, logoutAction } from "@/features/accounts/actions";
export const dynamic = "force-dynamic";
export default async function ChangePassword() {
  const actor = await pageActor(true);
  return <AuthFrame title={actor.mustChangePassword ? "Set your password" : "Change password"} description="Use at least 12 characters that you don’t use elsewhere. You’ll sign in again afterwards." footer={<form action={logoutAction}><Button variant="link" type="submit">Sign out instead</Button></form>}>
    <ActionForm action={passwordAction} submitLabel="Save password"><Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} /><Field label="New password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required hint="At least 12 characters." /><Field label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></ActionForm>
  </AuthFrame>;
}
