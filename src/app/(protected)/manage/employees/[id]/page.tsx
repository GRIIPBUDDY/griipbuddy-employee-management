import { getIdentity, pageActor } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { employeeProfile } from "@/features/people/data";
import { ProfileDetails } from "@/components/profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { EmployeeTimeLinks } from "@/components/time/management";
import { EmployeeWorkspace } from "@/components/people/workspace";
export default async function Employee({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getIdentity(), actor = await pageActor();
  const profile = await pageResult(employeeProfile(identity, (await params).id));
  const staff = actor.role !== "EMPLOYEE";
  return <><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4">{profile.photoDocumentId && <img src={`/api/employees/${profile.id}/documents/${profile.photoDocumentId}?view=1`} alt={`${profile.legalName} profile`} width={64} height={64} className="h-16 w-16 rounded-full object-cover" />}<h1 className="text-3xl font-semibold tracking-tight">{profile.legalName}</h1></div>{staff && <Link className="font-medium text-blue-700" href={`/manage/employees/${profile.id}/edit`}>Edit employee</Link>}</div>{staff && <><EmployeeTimeLinks employeeId={profile.id} /><Link className="text-sm font-medium text-blue-700" href={`/manage/employees/${profile.id}/compensation`}>Compensation & history</Link></>}<Card><CardHeader><CardTitle>Employee details</CardTitle></CardHeader><CardContent><ProfileDetails profile={profile} /></CardContent></Card><EmployeeWorkspace identity={identity} employeeId={profile.id} staff={staff} /></>;
}
