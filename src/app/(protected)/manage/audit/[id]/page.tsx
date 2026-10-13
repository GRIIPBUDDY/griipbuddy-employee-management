import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { auditData } from "@/features/insights/audit";
import { displayInstant } from "@/features/time/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/description-list";
const words = (v: string) => v.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase());
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const data = await pageResult(auditData(await getIdentity(), {}, (await params).id)), row = data.records[0];
  return <>
    <PageHeader breadcrumbs={[{ label: "Audit log", href: "/manage/audit" }, { label: "Event" }]} title={words(row.action)} description={`${displayInstant(row.eventTime, data.timezone)} · ${row.actorName}`} />
    <Card><CardHeader><CardTitle>Event details</CardTitle></CardHeader><CardContent><DescriptionList items={[["Record type", row.entity.replaceAll("_", " ")], ["Record ID", <span key="r" className="break-all font-mono text-xs">{row.entityId ?? "—"}</span>], ["Affected employee", row.employeeName ?? "None"], ["Performed by", row.actorName], ["Request", <span key="q" className="break-all font-mono text-xs">{row.requestId}</span>], ["System source", row.systemSource ?? "—"], ...(row.reason ? [["Reason", <span key="why" className="whitespace-pre-wrap font-normal">{row.reason}</span>] as [string, React.ReactNode]] : [])]} /></CardContent></Card>
    <div className="grid gap-5 lg:grid-cols-2">{(["before", "after"] as const).map(key => <Card key={key}><CardHeader><CardTitle>{key === "before" ? "Before" : "After"}</CardTitle></CardHeader><CardContent><pre className="max-h-[32rem] max-w-full overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-subtle p-4 font-mono text-xs leading-5">{JSON.stringify(row[key], null, 2) ?? "No structured values recorded."}</pre></CardContent></Card>)}</div>
  </>;
}
