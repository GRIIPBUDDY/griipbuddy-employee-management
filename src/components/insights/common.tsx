import { formatMoney } from "@/features/pay/currency";
import { BarChart3 } from "lucide-react";
import { SelectField } from "@/components/ui/field";
import { TabNav } from "@/components/ui/tabs";
import { FilterBar } from "@/components/ui/filter-bar";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { TableContainer } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import type { reportData } from "@/features/insights/reports";
import { reportKinds, reportStatuses, type ReportKind } from "@/features/insights/validation";
import type { RangeMode } from "@/lib/utils/date-range";
import { hm } from "@/components/time/attendance";
export const reportNames: Record<ReportKind, string> = { employees: "Employees", attendance: "Attendance", lateness: "Late & absence", overtime: "Weekly overtime", leave: "Leave", salary: "Salary", commissions: "Commissions", documents: "Document expiry", tasks: "Tasks" };
export const reportDescriptions: Record<ReportKind, string> = { employees: "Directory with department, position and employment status.", attendance: "Scheduled, required and actual time per employee and date.", lateness: "Late arrivals, absences and early departures per employee, by month or range.", overtime: "Potential and approved overtime per workweek.", leave: "Leave requests intersecting the dates.", salary: "Monthly salary components and totals.", commissions: "Pre-order commission records.", documents: "Document expiry status (metadata only).", tasks: "Task assignments and completion." };
export function ReportNav({ commission }: { commission: boolean }) { return <TabNav label="Report types" items={reportKinds.filter(k => commission || k !== "commissions").map(k => ({ label: reportNames[k], href: `/manage/reports/${k}` }))} />; }
const words = (v: string) => v[0] + v.slice(1).toLowerCase().replaceAll("_", " ");
export function ReportFilters({ kind, query, employees, departments, range, timezone }: { kind: ReportKind; query: Record<string, string | string[] | undefined>; employees: { id: string; legalName: string; employeeNumber: string }[]; departments: { id: string; name: string }[]; range?: { mode: RangeMode; from?: string; to?: string }; timezone?: string }) {
  const v = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  const calculated = kind === "attendance" || kind === "overtime", dated = calculated || kind === "tasks";
  return <FilterBar resetHref={`/manage/reports/${kind}`}>
    <DateRangeFilter mode={range?.mode ?? (dated ? "today" : "all")} from={range?.from} to={range?.to} modes={dated ? ["today", "date", "week", "month", "custom"] : ["all", "today", "week", "month", "custom"]} label={kind === "documents" ? "Expiry dates" : "Dates"} timezone={timezone} />
    {kind === "tasks" && <SelectField label="Date applies to" name="dateBy" defaultValue={v("dateBy") || "ASSIGNED"}><option value="ASSIGNED">Assigned date</option><option value="DUE">Due date</option><option value="COMPLETED">Completion date</option></SelectField>}
    <SelectField label="Employee" name="employeeId" defaultValue={v("employeeId")}><option value="">All employees</option>{employees.map(e => <option key={e.id} value={e.id}>{e.employeeNumber} · {e.legalName}</option>)}</SelectField>
    <SelectField label="Department" name="departmentId" defaultValue={v("departmentId")}><option value="">All departments</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectField>
    <SelectField label="Status" name="status" defaultValue={v("status")}><option value="">All statuses</option>{reportStatuses[kind].map(s => <option key={s} value={s}>{words(s)}</option>)}</SelectField>
    {kind === "attendance" && <SelectField label="Dates shown" name="days" defaultValue={v("days") || "ACTIVE"}><option value="ACTIVE">Scheduled or worked days</option><option value="ALL">Every date in range</option></SelectField>}
  </FilterBar>;
}
export function ReportTable({ data }: { data: Awaited<ReturnType<typeof reportData>> }) {
  if (!data.records.length) return <EmptyState icon={BarChart3} title="No records match these filters" description="Widen the dates or remove a filter." />;
  return <TableContainer label="Report results"><table className="data-table"><thead><tr>{data.columns.map(c => <th key={c.key} className={c.key.endsWith("_seconds") || c.key.endsWith("_amount") || c.key.endsWith("_count") ? "num" : undefined}>{c.label.replace(" seconds", "")}</th>)}</tr></thead><tbody>{data.records.map((row, i) => <tr key={i}>{data.columns.map(c => { const value = row[c.key]; return <td key={c.key} className={c.key.endsWith("_seconds") || c.key.endsWith("_amount") || c.key.endsWith("_count") ? "num" : "whitespace-nowrap"}>{value === null ? <span className="text-slate-400">—</span> : c.key.endsWith("_seconds") && typeof value === "number" ? hm(value) : c.key.endsWith("_amount") && typeof row.currency === "string" ? formatMoney(String(value), row.currency) : c.key === "status" && typeof value === "string" && !value.includes(" ") ? <StatusBadge status={value} /> : String(value)}</td>; })}</tr>)}</tbody></table></TableContainer>;
}
