import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ownRatings } from "@/features/performance/service";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Metric } from "@/components/ui/stat";
import { ScoreSummary, Breakdown, TargetTable, RatingStatus, monthLabel, quarterLabel, pts } from "@/components/performance/performance";
import { severityLabels } from "@/features/performance/policy";
export default async function Page() {
  const data = await pageResult(ownRatings(await getIdentity()));
  if (!data) return <EmptyState title="No employee profile linked" description="This account is not linked to an employee profile." />;
  return <>
    <PageHeader title="Ratings & targets" description="Your monthly rating is out of 10: an HR/Admin assessment out of 5 plus an automated score out of 5 from your work time (70 % minutes, 30 % days attended), tasks completed on time and targets reached. Confirmed warnings reduce only the automated part. Quarterly ratings average your finalized months." />
    <div className="grid gap-3 sm:grid-cols-3">{data.quarters.length ? data.quarters.map(q => <Metric key={q.key} label={`${quarterLabel(q.key)} rating`} value={pts(q.total, 10)} hint={`${q.status === "FINAL" ? "Final" : `Provisional · ${q.months} of 3 months`} · HR ${q.manual.toFixed(2)} + automated ${q.automated.toFixed(2)}`} />) : <Metric label="Quarterly rating" value="—" hint="Appears once a month is finalized" />}
      <Metric label="This month's tasks" value={`${data.tasks.onTime} / ${data.tasks.total}`} hint={`on time · ${data.tasks.late} late · ${data.tasks.open} open`} /></div>
    <Card><CardHeader><CardTitle>Targets</CardTitle><CardDescription>Your weekly and monthly targets and recorded results.</CardDescription></CardHeader><CardContent><TargetTable records={data.targets} today={data.today} staff={false} /></CardContent></Card>
    {data.monthly.length === 0 ? <EmptyState title="No finalized monthly ratings yet" description="A month's rating appears here once it is finalized." /> : data.monthly.map(m => <Card key={m.month}>
      <CardHeader><CardTitle>{monthLabel(m.month)}</CardTitle><CardDescription><RatingStatus status={m.status} /></CardDescription></CardHeader>
      <CardContent className="space-y-4"><ScoreSummary a={m} />{m.comment && <p className="text-sm"><span className="font-medium">Reviewer comment:</span> {m.comment}</p>}
        <details className="rounded-lg border px-4 py-3"><summary className="cursor-pointer text-sm font-medium">How this rating was calculated</summary><div className="mt-4">{m.breakdown && <Breakdown b={m.breakdown} />}</div></details></CardContent>
    </Card>)}
    <p className="text-xs text-muted-foreground">Warning deductions: {Object.entries(data.mapping).map(([k, v]) => `${severityLabels[k as keyof typeof severityLabels]} ${v.toFixed(2)}`).join(" · ")}. Warnings never change your salary.</p>
  </>;
}
