import { pageActor, getIdentity } from "@/lib/auth/request";
import { organizationSummary } from "@/features/settings/service";
import { unreadNotifications } from "@/features/review/notifications";
import { AppShell } from "@/components/layout/shell";
export const dynamic = "force-dynamic";
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const actor = await pageActor();
  const identity=await getIdentity();
  const [settings,unread]=await Promise.all([organizationSummary(identity),unreadNotifications(identity)]);
  return <AppShell actor={actor} companyName={settings.companyName} unread={unread}>{children}</AppShell>;
}
