import "server-only";
import type { Identity } from "@/types/auth";
import { createPdf, type Column } from "@/lib/pdf/document";
import { formatMoney } from "@/features/pay/currency";
import { reportData } from "./reports";
const names: Record<string, string> = { employees: "Employee report", attendance: "Attendance report", lateness: "Late & absence report", overtime: "Weekly overtime report", leave: "Leave report", salary: "Salary report", commissions: "Commission report", documents: "Document expiry report", tasks: "Task report" };
const hm = (s: number) => `${Math.floor(s / 3600)}h ${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}m`;
const words = (v: string) => v.split(" · ").map(p => p[0] + p.slice(1).toLowerCase().replaceAll("_", " ")).join(", ");
/** Any report as a branded landscape PDF, using the same filters, permissions and row limit as the CSV export. */
export async function reportPdf(identity: Identity | null, kind: unknown, query: Record<string, string>) {
  const data = await reportData(identity, kind, query, true);
  const pdf = await createPdf(names[data.kind] ?? "Report", `${data.label} · ${data.timezone}`, true);
  const rows = data.records.map(row => data.columns.map(c => {
    const value = row[c.key];
    if (value === null || value === undefined) return null;
    if (c.key.endsWith("_seconds") && typeof value === "number") return hm(value);
    if (c.key.endsWith("_amount") && typeof row.currency === "string") return formatMoney(String(value), row.currency);
    if (c.key === "status" && typeof value === "string" && /^[A-Z_ ·]+$/.test(value)) return words(value);
    return value;
  }));
  const columns: Column[] = data.columns.map(c => ({ label: c.label.replace(" seconds", "").replace(" (completed)", ""), width: 1, align: /_(seconds|amount|count)$/.test(c.key) ? "right" : "left" }));
  pdf.paragraph(`${data.total} record${data.total === 1 ? "" : "s"}. Dates are inclusive and use the organization timezone.`);
  pdf.table(columns, rows, { auto: true }); // column widths follow their content
  return { bytes: await pdf.bytes(), filename: `${data.kind}-report-${data.from ?? "all"}.pdf` };
}
