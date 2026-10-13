import { CalendarPlus } from "lucide-react";
import { reviewAction } from "@/features/review/actions";
import { Hidden } from "@/components/review/forms";
import { policies } from "@/features/review/calculation";
import { getIdentity } from "@/lib/auth/request";
import { pageResult } from "@/lib/auth/page-result";
import { securityBoundary } from "@/lib/authorization/actor";
import { assertRole } from "@/lib/authorization/policy";
import { organizationSummary, backupStatus } from "@/features/settings/service";
import { settingsAction } from "@/features/settings/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, SelectField, FormSection, FieldGrid } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { PageHeader } from "@/components/ui/page-header";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { TableContainer } from "@/components/ui/table";
import { displayInstant } from "@/features/time/dates";
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export default async function Settings() {
  const identity = await getIdentity();
  await pageResult(securityBoundary(identity, async actor => assertRole(actor, ["ADMIN"])));
  const settings = await pageResult(organizationSummary(identity)), backup = await pageResult(backupStatus(identity));
  return <>
    <PageHeader title="Settings" description="Organization-wide defaults. Changes apply to future records; history keeps the rules it was created with." />
    <Card><CardHeader><CardTitle>Organization</CardTitle><CardDescription>Business dates follow the organization timezone. Money defaults to Bangladeshi Taka (BDT, ৳).</CardDescription></CardHeader><CardContent>
      <ActionForm action={settingsAction} submitLabel="Save settings" confirmation={{ title: "Save organization settings?", description: "These defaults affect future records. Existing records keep their stored currency, timezone snapshots and rules." }}><div className="space-y-6">
        <FormSection title="Company"><Field label="Organization name" name="companyName" required maxLength={150} defaultValue={settings.companyName} /></FormSection>
        <FormSection title="Time" description="The timezone locks once official time records exist."><FieldGrid><Field label="Timezone (IANA)" name="timezone" required maxLength={100} defaultValue={settings.timezone} list="timezones" hint="e.g. Asia/Dhaka" /><Field label="Early check-in allowance (minutes)" name="earlyCheckinMinutes" type="number" required min={0} max={60} defaultValue={settings.earlyCheckinMinutes} hint="Check-in opens this many minutes before a period." /></FieldGrid><datalist id="timezones">{Intl.supportedValuesOf("timeZone").map(zone => <option key={zone} value={zone} />)}</datalist></FormSection>
        <FormSection title="Currency" description="Amounts are never converted automatically."><Field label="Default currency (ISO code)" name="currency" required minLength={3} maxLength={3} defaultValue={settings.currency} hint="Changing it requires closed payroll, settled commission claims and ended compensation terms." className="max-w-xs" /></FormSection>
      </div></ActionForm></CardContent></Card>
    <Card><CardHeader actions={<Dialog trigger={<><CalendarPlus size={16} aria-hidden="true" />Add future policy</>} title="Append a weekly overtime policy" description="Applies from a future week start. Historical thresholds are retained." size="sm"><ActionForm action={reviewAction} submitLabel="Add policy"><Hidden values={{ kind: "policy" }} /><Field label="Effective week start" name="effectiveFrom" type="date" required /><Field label="Weekly threshold (seconds)" name="thresholdSeconds" type="number" min={1} max={604800} step={1} required defaultValue={172800} hint="172800 seconds = 48 hours." /><SelectField label="First day of workweek" name="weekStartDay" defaultValue={settings.weekStartDay} hint="Frozen once official records exist.">{weekdays.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</SelectField><Field label="Reason" name="reason" required maxLength={500} /></ActionForm></Dialog>}>
      <CardTitle>Weekly overtime policy</CardTitle><CardDescription>Positive potential overtime always needs an explicit review. Leave is not worked time. Separate from the 48-hour standard weekly target.</CardDescription></CardHeader>
      <CardContent><TableContainer label="Overtime policies" flush className="rounded-lg border"><table className="data-table"><thead><tr><th>Effective from</th><th className="num">Weekly threshold</th><th>Version</th></tr></thead><tbody>{policies(settings.overtimePolicyVersions).map(p => <tr key={p.effectiveFrom}><td className="tabular-nums">{p.effectiveFrom}</td><td className="num">{p.thresholdSeconds / 3600} hours</td><td>v{p.ruleVersion}</td></tr>)}</tbody></table></TableContainer><p className="mt-3 text-sm text-muted-foreground">Workweek starts on {weekdays[settings.weekStartDay - 1]}.</p></CardContent></Card>
    <Card><CardHeader><CardTitle>Verified offsite backup</CardTitle><CardDescription>Recorded by the backup operator after encrypted transfer and integrity verification. Local dumps do not count.</CardDescription></CardHeader><CardContent>
      <Alert tone={backup.status === "CURRENT" ? "success" : "warning"} title={backup.status === "NEVER_VERIFIED" ? "No verified recovery set recorded" : backup.status === "STALE" ? "Last verified recovery set is older than 24 hours" : "Verified within the last 24 hours"}>{backup.lastSuccessfulBackupAt ? `Recovery set time: ${displayInstant(backup.lastSuccessfulBackupAt, settings.timezone)}` : "Contact the backup operator."}</Alert>
    </CardContent></Card>
  </>;
}
