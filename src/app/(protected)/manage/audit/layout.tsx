import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
export default async function Layout({children}:{children:React.ReactNode}) {
 await pageResult(securityBoundary(await getIdentity(),async actor=>assertRole(actor,["ADMIN","HR_MANAGER"])));
 return children;
}
