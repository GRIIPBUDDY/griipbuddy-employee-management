import { Plus } from "lucide-react";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { rateHistory } from "@/features/pay/rates";
import { employeeProfile } from "@/features/people/data";
import { EmployeeHeader } from "@/components/people/employee-header";
import { RateForm, RateHistory } from "@/components/pay/compensation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getIdentity(), id = (await params).id, data = await pageResult(rateHistory(identity, id)), profile = await pageResult(employeeProfile(identity, id));
  return <><EmployeeHeader employee={profile} title="Compensation" />
    <Card><CardHeader actions={<Dialog variant="default" trigger={<><Plus size={16} aria-hidden="true" />Add terms</>} title="Add compensation terms" description={`Amounts in ${data.currency}. Monthly salary prorates by calendar day; approved overtime is paid at the individual overtime hourly rate.`} size="lg"><RateForm data={data} /></Dialog>}><CardTitle>Compensation history</CardTitle><CardDescription>Effective-dated terms. Every version is retained; finalized earnings are never rewritten. Employees cannot change their own compensation.</CardDescription></CardHeader><CardContent><RateHistory data={data} staff /></CardContent></Card>
  </>;
}
