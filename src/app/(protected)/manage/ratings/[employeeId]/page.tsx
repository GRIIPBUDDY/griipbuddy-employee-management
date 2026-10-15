import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { assessmentDetail } from "@/features/performance/service";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ScoreSummary, Breakdown, ManualForm, FinalizeForm, ReopenForm, RatingStatus, monthLabel } from "@/components/performance/performance";
import { strings, type Query } from "@/lib/utils/query";
export default async function Page({ params, searchParams }: { params: Promise<{ employeeId: string }>; searchParams: Promise<Query> }) {
  const { employeeId } = await params, q = strings(await searchParams), month = q.month ?? "";
  const data = await pageResult(assessmentDetail(await getIdentity(), employeeId, month));
  const finalized = data.status === "FINALIZED";
  return <>
    <PageHeader breadcrumbs={[{ label: "Performance ratings", href: `/manage/ratings?month=${data.month.slice(0, 7)}` }, { label: data.employee.legalName }]} title={`${data.employee.legalName} · ${monthLabel(data.month)}`} description={`${data.employee.employeeNumber} · monthly rating out of 10 (HR/Admin 5 + automated 5).`} meta={<RatingStatus status={data.status} />}
      actions={finalized && data.isAdmin ? <ReopenForm employeeId={employeeId} month={data.month} a={data} /> : undefined} />
    {data.reopenReason && !finalized && <Alert tone="info" title="Reopened for correction">{data.reopenReason}</Alert>}
    <ScoreSummary a={data} />
    {data.breakdown && <Breakdown b={data.breakdown} />}
    {finalized ? <Card><CardHeader><CardTitle>HR/Admin assessment</CardTitle><CardDescription>Finalized {data.finalizedAt ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: data.timezone }).format(data.finalizedAt) : ""}. These values no longer change.</CardDescription></CardHeader>
      <CardContent className="space-y-2 text-sm"><p><span className="font-medium">Comment:</span> {data.comment || "—"}</p><p className="text-muted-foreground"><span className="font-medium text-foreground">Private note:</span> {data.privateNote || "—"}</p></CardContent></Card>
      : <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>HR/Admin assessment</CardTitle><CardDescription>0 to 5 in steps of 0.5. Warnings never reduce this part.</CardDescription></CardHeader><CardContent><ManualForm employeeId={employeeId} month={data.month} a={data} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Finalize</CardTitle><CardDescription>Freezes the rating and every input used. The quarter averages finalized months only.</CardDescription></CardHeader><CardContent><FinalizeForm employeeId={employeeId} month={data.month} a={data} /></CardContent></Card>
      </div>}
  </>;
}
