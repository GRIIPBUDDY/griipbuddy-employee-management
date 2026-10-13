import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { weeklyData, monthToDate } from "@/features/pay/weekly";
import { WeeklyStatements } from "@/components/pay/weekly";
import { Earnings } from "@/components/pay/earnings";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
export default async function Page() {
  const i = await getIdentity(), [month, rows] = await Promise.all([pageResult(monthToDate(i)), pageResult(weeklyData(i, true))]);
  return <><PageHeader title="My earnings" description="This month’s accumulated earnings and your weekly statements." /><Earnings data={month} /><SectionHeading title="Weekly statements" description="Estimates become final after HR review." /><WeeklyStatements rows={rows} /></>;
}
