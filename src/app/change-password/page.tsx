import { pageActor } from "@/lib/auth/request";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { passwordAction, logoutAction } from "@/features/accounts/actions";
export const dynamic = "force-dynamic";
export default async function ChangePassword() {
  const actor = await pageActor(true);
  return <main id="main" className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><Card className="w-full max-w-md"><CardHeader><CardTitle>{actor.mustChangePassword ? "Set your permanent password" : "Change password"}</CardTitle><CardDescription>Use at least 12 characters. After saving, sign in again.</CardDescription></CardHeader><CardContent>
    <ActionForm action={passwordAction} submitLabel="Save password"><Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} /><Field label="New password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /><Field label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></ActionForm>
    <form action={logoutAction} className="mt-5"><Button variant="ghost" type="submit">Sign out</Button></form>
  </CardContent></Card></main>;
}
