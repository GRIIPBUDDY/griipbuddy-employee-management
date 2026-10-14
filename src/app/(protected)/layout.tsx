import { pageActor, getIdentity } from "@/lib/auth/request";
import { organizationSummary } from "@/features/settings/service";
import { unreadNotifications } from "@/features/review/notifications";
import { AppShell } from "@/components/layout/shell";
import { branding } from "@/features/settings/organization";
import { enabledModules } from "@/features/settings/config";
import { disabledPaths } from "@/features/settings/options";
export const dynamic = "force-dynamic";
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const actor = await pageActor();
  const identity=await getIdentity();
  const [,unread,brand,modules]=await Promise.all([organizationSummary(identity),unreadNotifications(identity),branding(),enabledModules()]);
  return <AppShell actor={actor} companyName={brand.companyName} logo={`/brand/logo?v=${brand.logoRevision}`} disabled={disabledPaths(modules)} unread={unread}>{children}</AppShell>;
}
