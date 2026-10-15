import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { ratingRanking } from "@/features/performance/service";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { SelectField } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { RatingsNav, RankingTable, monthLabel, quarterLabel } from "@/components/performance/performance";
import { strings, type Query } from "@/lib/utils/query";
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = strings(await searchParams), data = await pageResult(ratingRanking(await getIdentity(), { quarter: q.quarter ?? "", departmentId: q.departmentId ?? "" }));
  const [cy, cq] = [Number(data.current.slice(0, 4)), Number(data.current.slice(6))];
  const quarters = Array.from({ length: 8 }, (_, i) => { const n = cy * 4 + cq - 1 - i; return `${Math.floor(n / 4)}-Q${n % 4 + 1}`; });
  const period = `Q${data.quarter} ${data.year}`;
  return <>
    <PageHeader title="Quarterly ranking" description="The quarterly rating is the average of three finalized monthly ratings (0–10); warning deductions are already inside each month and are not applied again. Missing months never count as zero: a quarter stays provisional until all three months are finalized. Equal ratings share a rank and the next rank is skipped (1, 1, 3)." />
    <RatingsNav />
    <FilterBar resetHref="/manage/ratings/ranking" columns={3}>
      <SelectField name="quarter" label="Quarter" defaultValue={`${data.year}-Q${data.quarter}`}>{quarters.map(v => <option key={v} value={v}>{quarterLabel(v)}</option>)}</SelectField>
      <SelectField name="departmentId" label="Department" defaultValue={q.departmentId ?? ""}><option value="">All departments</option>{data.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectField>
    </FilterBar>
    <Card><CardHeader><CardTitle>Official ranking · {period}</CardTitle><CardDescription>Employees with all three months finalized.</CardDescription></CardHeader><CardContent><RankingTable rows={data.official} label={`Official ranking ${period}`} period={period} /></CardContent></Card>
    {data.provisional.length > 0 && <Card><CardHeader><CardTitle>Provisional (not ranked)</CardTitle><CardDescription>Quarter-to-date average of the finalized months only. Not ranked until the quarter is complete.</CardDescription></CardHeader><CardContent><RankingTable rows={data.provisional} label={`Provisional ${period}`} period={period} /></CardContent></Card>}
    <div className="grid gap-5 xl:grid-cols-3">{data.monthly.map(m => <Card key={m.month}><CardHeader><CardTitle>{monthLabel(m.month)}</CardTitle><CardDescription>Finalized monthly ratings.</CardDescription></CardHeader>
      <CardContent>{m.ranking.length ? <ol className="divide-y text-sm">{m.ranking.map(r => <li key={r.employeeId} className="flex items-center justify-between gap-3 py-2"><span><span className="mr-2 inline-block w-6 text-right font-semibold tabular-nums">{r.rank}</span>{r.name}</span><span className="font-semibold tabular-nums">{r.total.toFixed(2)}</span></li>)}</ol> : <p className="text-sm text-muted-foreground">Nothing finalized yet.</p>}</CardContent></Card>)}</div>
  </>;
}
