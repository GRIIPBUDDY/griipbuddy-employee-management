import Link from "next/link";
import { KeyRound } from "lucide-react";
import { getIdentity, pageActor } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { emailSettings } from "@/features/accounts/email";
import { controlAction } from "@/features/accounts/control-actions";
import { ActionForm } from "@/components/ui/action-form";
import { Field, FormSection } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DescriptionList } from "@/components/ui/description-list";
import { TableContainer } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
const roleName = (role: string) => role === "ADMIN" ? "Administrator" : role === "HR_MANAGER" ? "HR / Manager" : "Employee";
export default async function Settings() {
  const actor = await pageActor(), data = await pageResult(emailSettings(await getIdentity()));
  return <>
    <PageHeader title="Account settings" description="Your login and security. Role and access are managed by an administrator." />
    <Card><CardHeader actions={<Button asChild variant="outline"><Link href="/change-password"><KeyRound size={16} aria-hidden="true" />Change password</Link></Button>}><CardTitle>Login</CardTitle></CardHeader><CardContent><DescriptionList items={[["Login email", data.email], ["Name", actor.name], ["Role", roleName(actor.role)], ["Account status", <StatusBadge key="s" status={actor.accountStatus ?? "ACTIVE"} />]]} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Change login email</CardTitle><CardDescription>We verify the new address before switching. Your current email keeps working until then, your role and permissions do not change, and you sign in again afterwards.</CardDescription></CardHeader><CardContent>
      <ActionForm action={controlAction} submitLabel="Send verification link" resetOnSuccess><input type="hidden" name="kind" value="email" />
        <FormSection title="New address" description="Verify within one hour."><Field label="New email" name="newEmail" type="email" required maxLength={254} autoComplete="email" /><Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} hint="Required to confirm it’s you." /></FormSection>
      </ActionForm>
      {data.requests.length > 0 && <div className="mt-6"><p className="mb-2 text-sm font-semibold">Recent requests</p><TableContainer label="Email change requests" flush className="rounded-lg border"><table className="data-table"><thead><tr><th>New email</th><th>Status</th><th>Delivery</th><th className="text-right">Action</th></tr></thead><tbody>{data.requests.map(r => <tr key={r.id}><td className="font-medium">{r.newEmail}</td><td><StatusBadge status={r.status} /></td><td className="text-[13px] text-muted-foreground">{r.deliveryStatus.toLowerCase()}</td><td className="text-right">{r.status === "COMPLETED" && !r.noticeDeliveredAt && <ActionForm compact action={controlAction} submitVariant="ghost" submitSize="sm" submitLabel="Retry notice to old address"><input type="hidden" name="kind" value="retryNotice" /><input type="hidden" name="id" value={r.id} /></ActionForm>}</td></tr>)}</tbody></table></TableContainer></div>}
    </CardContent></Card>
  </>;
}
