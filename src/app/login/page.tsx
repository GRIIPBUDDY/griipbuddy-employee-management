import { Field, CheckboxField } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { AuthFrame } from "@/components/layout/sign-in-frame";
import { loginAction } from "@/features/accounts/actions";
export default async function Login({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const { changed } = await searchParams;
  return <AuthFrame title="Sign in" description="Use your work email and password." footer="Need an account or a password reset? Contact your administrator.">
    {changed && <Alert tone="success" role="status" className="mb-5">Password updated. Sign in with your new password.</Alert>}
    <ActionForm action={loginAction} submitLabel="Sign in"><Field label="Work email" name="email" type="email" required autoComplete="username" maxLength={254} autoFocus /><Field label="Password" name="password" type="password" required autoComplete="current-password" maxLength={128} /><CheckboxField name="remember" label="Remember me" description="Stay signed in on this device for up to 30 days. Don’t use on shared computers." /></ActionForm>
  </AuthFrame>;
}
