import "server-only";
import { db } from "@/lib/db/client";
import { securityBoundary } from "@/lib/authorization/actor";
import { validated, uuidSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/utils/errors";
import type { Identity } from "@/types/auth";
import { addDays, dateKey, dateValue, displayInstant } from "@/features/time/dates";
import { reportCsv } from "@/features/insights/csv";
import { createPdf } from "@/lib/pdf/document";
import { salaryData } from "./periods";
import { formatMoney } from "./currency";
import { decimal, money } from "./money";
import { payStaff } from "./access";
import { readPayout, maskAccount, payoutMethods } from "./payout";
const monthLabel = (from: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${from.slice(0, 7)}-01T00:00:00Z`));
const dateLabel = (date: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const hours = (seconds: number) => `${(seconds / 3600).toFixed(2)} h`;
const adjustmentLabel: Record<string, string> = { BONUS: "Bonus / allowance", DEDUCTION: "Deduction", OTHER: "Other adjustment", CORRECTION: "Correction" };
/** Employment details effective on the month's first covered day. */
async function employeeInfo(employeeId: string, from: string, until: string) {
  const employee = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { employeeNumber: true, legalName: true, bankDetails: true, employmentPeriods: { where: { startDate: { lt: dateValue(until) }, OR: [{ endDate: null }, { endDate: { gt: dateValue(from) } }] }, orderBy: { startDate: "desc" }, take: 1, select: { departmentLabel: true, positionLabel: true, department: { select: { name: true } }, position: { select: { name: true } } } } } });
  const period = employee.employmentPeriods[0];
  return { number: employee.employeeNumber, name: employee.legalName, department: period?.department?.name ?? period?.departmentLabel ?? "", position: period?.position?.name ?? period?.positionLabel ?? "", payout: readPayout(employee.bankDetails) };
}
/** Payslip PDF for one salary statement. Employees receive only their finalized statements, with commission detail per permission. */
export async function payslipPdf(identity: Identity | null, idInput: unknown, own: boolean) {
  const id = validated(uuidSchema, idInput);
  const data = await salaryData(identity, { id }, own), row = data.records[0];
  const calculation = await db.salaryCalculation.findUniqueOrThrow({ where: { id: row.id }, select: { employeeId: true } });
  const info = await employeeInfo(calculation.employeeId, row.period.from, row.period.until), currency = row.period.currency, final = row.period.status === "FINALIZED";
  const brandZone = (await db.organizationSettings.findUniqueOrThrow({ where: { id: 1 }, select: { timezone: true } })).timezone;
  const pdf = await createPdf("Payslip", monthLabel(row.period.from));
  pdf.details([
    ["Employee", info.name], ["Employee ID", info.number],
    ["Department", info.department], ["Position", info.position],
    ["Pay period", `${dateLabel(row.period.from)} - ${dateLabel(addDays(row.period.until, -1))}`], ["Statement status", final ? "Finalized" : `Estimate (${row.period.status.toLowerCase()})`],
    ["Payment", row.period.paymentStatus === "PAID" ? `Paid ${row.period.paidAt ? displayInstant(row.period.paidAt, brandZone) : ""}` : "Not yet paid"],
    ["Paid to", info.payout ? `${payoutMethods[info.payout.method]}${info.payout.method === "CASH" ? "" : ` · ${info.payout.bankName ? `${info.payout.bankName} · ` : ""}${maskAccount(info.payout.accountNumber)}`}` : "Not recorded"],
  ]);
  if (!final) pdf.paragraph("This is an estimate. Amounts can change until the salary month is finalized.");
  if ("baseAmount" in row) {
    pdf.heading("Earnings and deductions");
    const lines: [string, string | undefined, boolean?][] = [["Basic / regular earnings", row.baseAmount], ["Approved overtime", row.overtimeAmount], ...("commissionAmount" in row ? [["Approved pre-order commission", row.commissionAmount] as [string, string]] : []), ["Bonuses & allowances", row.bonusAmount], ["Other adjustments & corrections", row.otherAmount], ["Deductions", row.deductionAmount, true]];
    pdf.table([{ label: "Component", width: 3 }, { label: "Amount", width: 1, align: "right" }], lines.map(([name, amount, minus]) => [name, amount ? `${minus && amount !== "0.00" ? "-" : ""}${formatMoney(amount, currency)}` : "-"]));
    const snapshot = row.snapshot;
    if (snapshot.segments.some(x => x.scheduledSeconds > 0 || x.actualSeconds > 0)) {
      const sum = (key: "scheduledSeconds" | "coveredRegularSeconds" | "paidAbsenceSeconds" | "approvedOvertimeSeconds" | "actualSeconds") => snapshot.segments.reduce((n, s) => n + (s[key] ?? 0), 0);
      pdf.heading("Attendance basis");
      pdf.details([["Scheduled", hours(sum("scheduledSeconds"))], ["Worked within schedule", hours(sum("coveredRegularSeconds"))], ["Paid leave & holidays", hours(sum("paidAbsenceSeconds"))], ["Approved overtime", hours(sum("approvedOvertimeSeconds"))]], 4);
    }
    if (snapshot.adjustments.length) {
      pdf.heading("Adjustments");
      pdf.table([{ label: "Type", width: 1.2 }, { label: "Description", width: 3 }, { label: "Amount", width: 1, align: "right" }], snapshot.adjustments.map(a => [adjustmentLabel[a.type] ?? a.type, a.reason, formatMoney(a.amount, currency)]));
    }
  } else pdf.paragraph("Component detail is limited for this statement. The net amount is shown below.");
  pdf.total(final ? "Net pay" : "Estimated net pay", formatMoney(row.finalAmount, currency));
  pdf.paragraph("Amounts use precise decimal arithmetic; each component is rounded half-up to two decimals. Contact HR with any questions about this payslip.", 8);
  return { bytes: await pdf.bytes(), filename: `payslip-${row.period.from.slice(0, 7)}-${info.number}.pdf` };
}
async function periodRows(periodId: string) {
  const period = await db.salaryPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw new AppError(404, "NOT_FOUND", "Salary month not found.");
  const from = dateKey(period.startDate), until = dateKey(period.endDate);
  const rows = await db.salaryCalculation.findMany({ where: { salaryPeriodId: periodId }, select: { employeeId: true, finalAmount: true } });
  const people = await Promise.all(rows.map(async r => ({ ...(await employeeInfo(r.employeeId, from, until)), amount: r.finalAmount.toFixed(2) })));
  return { period, from, people: people.sort((a, b) => a.number.localeCompare(b.number)) };
}
/** Bulk-payment file for a finalized month: one row per employee with payout details and net pay. */
export async function paymentExport(identity: Identity | null, periodInput: unknown) {
  return securityBoundary(identity, async actor => {
    payStaff(actor); const { period, from, people } = await periodRows(validated(uuidSchema, periodInput));
    if (period.status !== "FINALIZED") throw new AppError(409, "NOT_FINAL", "Finalize the salary month before exporting payments.");
    const columns = [{ key: "employee_id", label: "Employee ID" }, { key: "name", label: "Employee" }, { key: "method", label: "Payment method" }, { key: "account_name", label: "Account name" }, { key: "account_number", label: "Account number" }, { key: "bank", label: "Bank" }, { key: "branch", label: "Branch" }, { key: "routing", label: "Routing number" }, { key: "amount", label: "Net amount" }, { key: "currency", label: "Currency" }, { key: "reference", label: "Reference" }];
    const records = people.map(p => ({ employee_id: p.number, name: p.name, method: p.payout ? payoutMethods[p.payout.method] : "Not recorded", account_name: p.payout?.accountName ?? "", account_number: p.payout?.accountNumber ?? "", bank: p.payout?.bankName ?? "", branch: p.payout?.branch ?? "", routing: p.payout?.routingNumber ?? "", amount: p.amount, currency: period.currency, reference: `SALARY-${from.slice(0, 7)}-${p.number}` }));
    return { csv: reportCsv(columns, records), filename: `salary-payments-${from.slice(0, 7)}.csv` };
  });
}
/** Payment register PDF: everyone on the month, net pay, payout method (masked accounts) and the total. */
export async function registerPdf(identity: Identity | null, periodInput: unknown) {
  return securityBoundary(identity, async actor => {
    payStaff(actor); const { period, from, people } = await periodRows(validated(uuidSchema, periodInput));
    const pdf = await createPdf("Salary payment register", monthLabel(from), true), final = period.status === "FINALIZED";
    pdf.details([["Salary month", monthLabel(from)], ["Status", final ? "Finalized" : `Not finalized (${period.status.toLowerCase()})`], ["Payment", period.paymentStatus === "PAID" ? `Paid${period.paymentReference ? ` · ${period.paymentReference}` : ""}` : "Not yet paid"], ["Employees", String(people.length)]], 4);
    if (!final) pdf.paragraph("Amounts are estimates until the month is finalized.");
    const total = money(people.reduce((n, p) => n.plus(p.amount), decimal(0)));
    pdf.table([{ label: "Employee ID", width: 1 }, { label: "Employee", width: 2.2 }, { label: "Department", width: 1.6 }, { label: "Method", width: 1.1 }, { label: "Account", width: 1.8 }, { label: "Net amount", width: 1.3, align: "right" }],
      people.map(p => [p.number, p.name, p.department, p.payout ? payoutMethods[p.payout.method] : "Not recorded", p.payout && p.payout.method !== "CASH" ? `${p.payout.bankName ? `${p.payout.bankName} ` : ""}${maskAccount(p.payout.accountNumber)}` : "-", formatMoney(p.amount, period.currency)]),
      { totals: ["", "Total", "", "", "", formatMoney(total, period.currency)] });
    return { bytes: await pdf.bytes(), filename: `salary-register-${from.slice(0, 7)}.pdf` };
  });
}
