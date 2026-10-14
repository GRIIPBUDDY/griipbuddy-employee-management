import { CalendarPlus, Plus } from "lucide-react";
import { reviewAction } from "@/features/review/actions";
import { Hidden } from "@/components/review/forms";
import { policies } from "@/features/review/calculation";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { organizationSummary, backupStatus } from "@/features/settings/service";
import { organizationConfig } from "@/features/settings/organization";
import { settingsAction } from "@/features/settings/actions";
import { configAction } from "@/features/settings/config-actions";
import { modules, optionLists, adjustmentKinds, weekdayNames } from "@/features/settings/options";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Field, SelectField, FormSection, FieldGrid, CheckboxField, TextAreaField } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { PageHeader } from "@/components/ui/page-header";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Tabs } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableContainer } from "@/components/ui/table";
import { LogoUpload } from "@/components/settings/logo-upload";
import { ColorField } from "@/components/settings/color-field";
import { displayInstant } from "@/features/time/dates";
type Option = Awaited<ReturnType<typeof organizationConfig>>["options"][number];
function OptionFields({ list, option }: { list: string; option?: Option }) {
  const a = option?.attributes ?? {};
  return <>
    <Field label="Label" name="label" required maxLength={100} defaultValue={option?.label} />
    {!option && <Field label="Code" name="code" required maxLength={20} pattern="[A-Za-z][A-Za-z0-9_]*" hint="Stored on records; cannot change later. Letters, digits and underscores." />}
    {list === "LEAVE_CATEGORY" && <FieldGrid><CheckboxField name="paid" label="Paid leave" defaultChecked={option ? a.paid !== false : true} description="Paid leave counts toward basic pay when the setting allows." /><Field label="Yearly allowance (days)" name="yearlyDays" type="number" min={0} max={366} step={0.5} defaultValue={typeof a.yearlyDays === "number" ? a.yearlyDays : ""} hint="Leave blank for no limit." /></FieldGrid>}
    {list === "ADJUSTMENT_CATEGORY" && <SelectField label="Effect on pay" name="kindValue" defaultValue={typeof a.kind === "string" ? a.kind : "BONUS"} disabled={!!option} hint={option ? "The pay effect is fixed once created." : undefined}>{Object.entries(adjustmentKinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>}
    <Field label="Display order" name="sortOrder" type="number" min={0} max={9999} defaultValue={option?.sortOrder ?? 100} className="max-w-[10rem]" />
    {option && <CheckboxField name="isActive" label="Available for new records" defaultChecked={option.isActive} description="Inactive options stay on historical records." />}
  </>;
}
function describe(list: string, o: Option) {
  if (list === "LEAVE_CATEGORY") return `${o.attributes.paid === false ? "Unpaid" : "Paid"} · ${typeof o.attributes.yearlyDays === "number" ? `${o.attributes.yearlyDays} days a year` : "no yearly limit"}`;
  if (list === "ADJUSTMENT_CATEGORY") return adjustmentKinds[o.attributes.kind as keyof typeof adjustmentKinds] ?? "Signed amount";
  return "";
}
export default async function Settings() {
  const identity = await getIdentity();
  await pageResult(securityBoundary(identity, async actor => assertRole(actor, ["ADMIN"])));
  const [settings, backup, config] = await Promise.all([pageResult(organizationSummary(identity)), pageResult(backupStatus(identity)), pageResult(organizationConfig(identity))]);
  const organization = <Card><CardHeader><CardTitle>Organization</CardTitle><CardDescription>Business dates follow the organization timezone. Money defaults to Bangladeshi Taka (BDT, ৳).</CardDescription></CardHeader><CardContent>
    <ActionForm action={settingsAction} submitLabel="Save settings" confirmation={{ title: "Save organization settings?", description: "These defaults affect future records. Existing records keep their stored currency, timezone snapshots and rules." }}><div className="space-y-6">
      <input type="hidden" name="companyName" value={settings.companyName} /><input type="hidden" name="earlyCheckinMinutes" value={settings.earlyCheckinMinutes} />
      <FormSection title="Time" description="The timezone locks once official time records exist."><Field label="Timezone (IANA)" name="timezone" required maxLength={100} defaultValue={settings.timezone} list="timezones" hint="e.g. Asia/Dhaka" className="max-w-sm" /><datalist id="timezones">{Intl.supportedValuesOf("timeZone").map(zone => <option key={zone} value={zone} />)}</datalist></FormSection>
      <FormSection title="Currency" description="Amounts are never converted automatically."><Field label="Default currency (ISO code)" name="currency" required minLength={3} maxLength={3} defaultValue={settings.currency} hint="Changing it requires closed payroll, settled commission claims and ended compensation terms." className="max-w-xs" /></FormSection>
    </div></ActionForm></CardContent></Card>;
  const brandingTab = <>
    <Card><CardHeader><CardTitle>Company identity</CardTitle><CardDescription>Shown on sign-in, in the navigation and at the top of every PDF (payslips, salary registers and reports).</CardDescription></CardHeader><CardContent>
      <ActionForm action={configAction} submitLabel="Save branding"><Hidden values={{ kind: "branding" }} /><div className="space-y-5">
        <FieldGrid><Field label="Display name" name="companyName" required maxLength={150} defaultValue={config.companyName} hint="Short name for the workspace." /><Field label="Legal name" name="companyLegalName" maxLength={150} defaultValue={config.companyLegalName} hint="Printed on PDFs, e.g. GRIIPBUDDY LLC." /></FieldGrid>
        <TextAreaField label="Registered address" name="companyAddress" maxLength={500} rows={2} defaultValue={config.companyAddress} hint="Printed under the legal name on PDFs." />
        <ColorField defaultValue={config.brandColor} />
      </div></ActionForm></CardContent></Card>
    <Card><CardHeader><CardTitle>Logo</CardTitle><CardDescription>{config.customLogo ? "A custom logo is in use." : "The default GriipBuddy logo is in use."}</CardDescription></CardHeader><CardContent><LogoUpload logo={`/brand/logo?v=${config.logoRevision}`} custom={config.customLogo} /></CardContent></Card>
  </>;
  const rules = <Card><CardHeader><CardTitle>Attendance, leave and pay rules</CardTitle><CardDescription>Apply from now on. Finalized salary and past decisions keep the rules they used.</CardDescription></CardHeader><CardContent>
    <ActionForm action={configAction} submitLabel="Save rules" confirmation={{ title: "Save rules?", description: "Check-in windows, lateness, leave counting and balances use the new rules from now on." }}><Hidden values={{ kind: "rules" }} /><div className="space-y-6">
      <FormSection title="Check-in and lateness"><FieldGrid><Field label="Early check-in allowance (minutes)" name="earlyCheckinMinutes" type="number" required min={0} max={60} defaultValue={config.earlyCheckinMinutes} hint="Check-in opens this many minutes before a period starts." /><Field label="Late grace period (minutes)" name="lateGraceMinutes" type="number" required min={0} max={120} defaultValue={config.lateGraceMinutes} hint="Arrivals within this time are not counted as late." /></FieldGrid></FormSection>
      <FormSection title="Working days" description="Used to count leave days and for the late & absence report. Schedules still define each employee’s hours."><fieldset className="flex flex-wrap gap-x-5 gap-y-2"><legend className="sr-only">Working days</legend>{weekdayNames.map((d, i) => <CheckboxField key={d} name="workingDays" value={i + 1} label={d} defaultChecked={config.workingDays.includes(i + 1)} />)}</fieldset></FormSection>
      <FormSection title="Leave"><FieldGrid>
        <SelectField label="Count leave in" name="leaveDayBasis" defaultValue={config.leaveDayBasis}><option value="WORKING">Working days (skip off days and holidays)</option><option value="CALENDAR">Calendar days</option></SelectField>
        <SelectField label="When a request exceeds the balance" name="leaveOverBalance" defaultValue={config.leaveOverBalance}><option value="BLOCK">Block the request</option><option value="FLAG">Allow it and flag it for HR</option></SelectField>
      </FieldGrid></FormSection>
      <FormSection title="Salary"><Field label="Salary payment day (of the following month)" name="salaryPaymentDay" type="number" min={1} max={28} defaultValue={config.salaryPaymentDay ?? ""} hint="Optional. Shown to employees as the expected payment date." className="max-w-xs" /></FormSection>
    </div></ActionForm></CardContent></Card>;
  const moduleTab = <Card><CardHeader><CardTitle>Modules</CardTitle><CardDescription>Switch features on or off for everyone. A switched-off module disappears from menus and its pages and APIs are unavailable. Its records are kept.</CardDescription></CardHeader><CardContent>
    <ActionForm action={configAction} submitLabel="Save modules" confirmation={{ title: "Update modules?", description: "Menus and access change immediately for every user. No records are deleted." }}><Hidden values={{ kind: "modules" }} />
      <div className="grid gap-3 sm:grid-cols-2">{modules.map(m => <div key={m.key} className="rounded-lg border p-4"><CheckboxField name={m.key} label={m.label} description={m.description} defaultChecked={config.modules[m.key]} /></div>)}</div>
    </ActionForm></CardContent></Card>;
  const lists = <>{optionLists.map(list => { const items = config.options.filter(o => o.list === list.key); return <Card key={list.key}><CardHeader actions={<Dialog trigger={<><Plus size={16} aria-hidden="true" />Add</>} title={`Add to ${list.label.toLowerCase()}`} size="sm"><ActionForm action={configAction} submitLabel="Add option"><Hidden values={{ kind: "optionCreate", list: list.key }} /><OptionFields list={list.key} /></ActionForm></Dialog>}><CardTitle>{list.label}</CardTitle><CardDescription>{list.description}</CardDescription></CardHeader><CardContent>
    <TableContainer label={list.label} flush className="rounded-lg border"><table className="data-table"><thead><tr><th>Label</th><th>Code</th>{(list.key === "LEAVE_CATEGORY" || list.key === "ADJUSTMENT_CATEGORY") && <th>Rule</th>}<th>Status</th><th className="text-right">Action</th></tr></thead><tbody>{items.map(o => <tr key={o.id}><td className="font-medium">{o.label}</td><td className="font-mono text-xs text-muted-foreground">{o.code}</td>{(list.key === "LEAVE_CATEGORY" || list.key === "ADJUSTMENT_CATEGORY") && <td className="text-sm">{describe(list.key, o)}</td>}<td><StatusBadge status={o.isActive ? "ACTIVE" : "INACTIVE"} label={o.isActive ? "Available" : "Inactive"} /></td><td className="text-right"><Dialog trigger="Edit" triggerSize="sm" variant="ghost" title={`Edit ${o.label}`} size="sm"><ActionForm action={configAction} submitLabel="Save option"><Hidden values={{ kind: "optionUpdate", list: list.key, code: o.code, revision: o.revision, ...(list.key === "ADJUSTMENT_CATEGORY" ? { kindValue: String(o.attributes.kind ?? "OTHER") } : {}) }} /><OptionFields list={list.key} option={o} /></ActionForm></Dialog></td></tr>)}</tbody></table></TableContainer>
  </CardContent></Card>; })}</>;
  const overtime = <Card><CardHeader actions={<Dialog trigger={<><CalendarPlus size={16} aria-hidden="true" />Add future policy</>} title="Append a weekly overtime policy" description="Applies from a future week start. Historical thresholds are retained." size="sm"><ActionForm action={reviewAction} submitLabel="Add policy"><Hidden values={{ kind: "policy", weekStartDay: settings.weekStartDay }} /><Field label="Effective week start" name="effectiveFrom" type="date" required /><Field label="Weekly threshold (hours)" name="thresholdHours" type="number" min={1} max={168} step={0.5} required defaultValue={48} hint="Worked time above this many hours a week is potential overtime." /><Field label="Reason" name="reason" required maxLength={500} /></ActionForm></Dialog>}>
    <CardTitle>Weekly overtime policy</CardTitle><CardDescription>Positive potential overtime always needs an explicit review before it is paid in the monthly salary. Leave is not worked time.</CardDescription></CardHeader>
    <CardContent><TableContainer label="Overtime policies" flush className="rounded-lg border"><table className="data-table"><thead><tr><th>Effective from</th><th className="num">Weekly threshold</th><th>Version</th></tr></thead><tbody>{policies(settings.overtimePolicyVersions).map(p => <tr key={p.effectiveFrom}><td className="tabular-nums">{p.effectiveFrom}</td><td className="num">{p.thresholdSeconds / 3600} hours</td><td>v{p.ruleVersion}</td></tr>)}</tbody></table></TableContainer><p className="mt-3 text-sm text-muted-foreground">Workweek starts on {weekdayNames[settings.weekStartDay - 1]} (fixed once official records exist).</p></CardContent></Card>;
  const backupTab = <Card><CardHeader><CardTitle>Verified offsite backup</CardTitle><CardDescription>Recorded by the backup operator after encrypted transfer and integrity verification. Local dumps do not count.</CardDescription></CardHeader><CardContent>
    <Alert tone={backup.status === "CURRENT" ? "success" : "warning"} title={backup.status === "NEVER_VERIFIED" ? "No verified recovery set recorded" : backup.status === "STALE" ? "Last verified recovery set is older than 24 hours" : "Verified within the last 24 hours"}>{backup.lastSuccessfulBackupAt ? `Recovery set time: ${displayInstant(backup.lastSuccessfulBackupAt, settings.timezone)}` : "Contact the backup operator."}</Alert>
  </CardContent></Card>;
  return <>
    <PageHeader title="Settings" description="Organization-wide configuration. Changes apply to future records; history keeps the rules it was created with." />
    <Tabs label="Settings sections" items={[{ label: "Branding", id: "branding", content: brandingTab }, { label: "Rules", id: "rules", content: rules }, { label: "Modules", id: "modules", content: moduleTab }, { label: "Lists", id: "lists", content: lists }, { label: "Overtime", id: "overtime", content: overtime }, { label: "Organization", id: "organization", content: organization }, { label: "Backup", id: "backup", content: backupTab }]} />
  </>;
}
