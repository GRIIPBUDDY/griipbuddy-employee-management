import Link from "next/link";
import { controlAction } from "@/features/accounts/control-actions";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { AuthFrame } from "@/components/layout/auth-frame";
export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AuthFrame title="Verify your login email" description="Confirm that you own this address. Your login email changes and all existing sessions are signed out." footer={<Link href="/login" className="link">Back to sign in</Link>}>
    {token && /^[a-f0-9]{64}$/.test(token) ? <ActionForm action={controlAction} submitLabel="Confirm email change"><input type="hidden" name="kind" value="confirmEmail" /><input type="hidden" name="token" value={token} /></ActionForm> : <Alert tone="danger" role="alert">This verification link is invalid or incomplete. Request a new one from Account settings.</Alert>}
  </AuthFrame>;
}
