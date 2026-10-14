import { pageActor, getIdentity } from "@/lib/auth/request";
import { unreadNotifications } from "@/features/review/notifications";
import { AppShell } from "@/components/layout/shell";
import { shellSettings } from "@/features/settings/config";
import { disabledPaths } from "@/features/settings/options";
export const dynamic = "force-dynamic";
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const actor = await pageActor();
  const identity=await getIdentity();
  // One settings read for the shell; pageActor above already enforced the session and account state.
  const [unread,shell]=await Promise.all([unreadNotifications(identity),shellSettings()]);
  return <AppShell actor={actor} companyName={shell.companyName} logo={`/brand/logo?v=${shell.logoRevision}`} disabled={disabledPaths(shell.modules)} unread={unread}>{children}</AppShell>;
}
