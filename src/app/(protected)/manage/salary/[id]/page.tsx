import { randomUUID } from "node:crypto";
import { formatMoney } from "@/features/pay/currency";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { salaryData, periodData } from "@/features/pay/periods";
import { SalaryStatement, monthName } from "@/components/pay/statement";
import { ActionForm, Field, SelectField, Hidden, payAction } from "@/components/pay/common";
import { PageHeader } from "@/components/ui/page-header";
import { Dialog } from "@/components/ui/dialog";
import { dateKey } from "@/features/time/dates";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getIdentity(), data = await pageResult(salaryData(identity, { id: (await params).id })), row = data.records[0], periods = await pageResult(periodData(identity));
  const later = periods.records.filter(p => p.status !== "FINALIZED" && dateKey(p.startDate) >= row.period.until);
  return <>
    <PageHeader breadcrumbs={[{ label: "Salary & payments", href: "/manage/salary" }, { label: monthName(row.period.from), href: `/manage/salary?id=${row.period.id}` }, { label: row.employee?.legalName ?? "Employee" }]} title={`${row.employee?.legalName ?? "Employee"} · ${monthName(row.period.from)}`} description="Monthly salary statement."
      actions={row.period.status === "FINALIZED" && "snapshot" in row && row.snapshot ? <Dialog trigger="Propose correction" title="Reconcile a later salary correction" description="Resolve attendance and overtime first. The server computes the corrected total minus the original and earlier corrections; the difference needs approval in a later open month.">
        <ActionForm action={payAction} submitLabel="Propose computed correction"><Hidden values={{ kind: "reconcile", originalCalculationId: row.id, operationKey: randomUUID() }} />
          <SelectField name="targetPeriodId" label="Later open salary month" required hint={later.length ? undefined : "Create a later salary month first."}><option value="">Choose month</option>{later.map(p => <option key={p.id} value={p.id}>{monthName(dateKey(p.startDate))}</option>)}</SelectField>
          {row.snapshot.commissions.length > 0 && <><SelectField name="preorderId" label="Commission to correct (optional)"><option value="">Keep earned commission amounts</option>{row.snapshot.commissions.map(c => <option key={c.id} value={c.id}>{c.reference} · {formatMoney(c.amount, row.period.currency)}</option>)}</SelectField><Field name="commissionAmount" label="Verified replacement commission amount" inputMode="decimal" hint="Zero for a refund." /></>}
          <Field name="reason" label="Correction reason and evidence" required maxLength={500} /></ActionForm></Dialog> : undefined} />
    <SalaryStatement row={row} />
  </>;
}
