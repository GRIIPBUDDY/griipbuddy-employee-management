import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { loginAction } from "@/features/accounts/actions";
export default async function Login({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const { changed } = await searchParams;
  return <main id="main" className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="w-full max-w-md"><p className="mb-6 text-center text-lg font-semibold text-blue-700">GriipBuddy · People</p><Card><CardHeader><CardTitle>Welcome back</CardTitle><CardDescription>Sign in to your employee workspace.</CardDescription></CardHeader><CardContent>
    {changed && <p role="status" className="mb-5 rounded bg-emerald-50 p-3 text-sm text-emerald-800">Password updated. Sign in with your new password.</p>}
    <ActionForm action={loginAction} submitLabel="Sign in"><Field label="Work email" name="email" type="email" required autoComplete="username" maxLength={254} /><Field label="Password" name="password" type="password" required autoComplete="current-password" maxLength={128} /></ActionForm>
    <p className="mt-6 text-sm text-muted-foreground">Need an account or a password reset? Contact your administrator.</p>
  </CardContent></Card></div></main>;
}
