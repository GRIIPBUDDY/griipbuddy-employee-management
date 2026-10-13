import type { EmployeeProfile } from "@/components/people/profile-fields";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/description-list";
import { StatusBadge } from "@/components/ui/status-badge";
const day = (date?: Date | null) => date?.toISOString().slice(0, 10) ?? null;
const words = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase());
export function ProfileDetails({ profile }: { profile: EmployeeProfile }) {
  const current = profile.employmentPeriods[0];
  return <div className="grid gap-5 xl:grid-cols-3">
    <div className="grid gap-5 xl:col-span-2">
      <Card><CardHeader><CardTitle>Personal information</CardTitle></CardHeader><CardContent><DescriptionList items={[["Legal name", profile.legalName], ["Preferred name", profile.preferredName], ["Employee ID", profile.employeeNumber], ["Date of birth", day(profile.dateOfBirth)], ["Gender", profile.gender], ["Nationality", profile.nationality]]} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Contact & emergency</CardTitle></CardHeader><CardContent><DescriptionList items={[["Phone", profile.phone], ["Address", profile.address], ["Emergency contact", profile.emergencyContact.name], ["Emergency phone", profile.emergencyContact.phone], ["Relationship", profile.emergencyContact.relationship]]} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Employment history</CardTitle><CardDescription>Most recent first. End dates are exclusive (the first day no longer employed).</CardDescription></CardHeader><CardContent><ol className="space-y-3">{profile.employmentPeriods.map(period => <li key={period.id} className="rounded-lg border bg-subtle p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{period.position?.name ?? period.positionLabel} · {period.department?.name ?? period.departmentLabel}</p><span className="text-sm text-muted-foreground tabular-nums">{day(period.startDate)} → {day(period.endDate) ?? "Present"}</span></div>
        {(period.department?.name !== period.departmentLabel || period.position?.name !== period.positionLabel) && <p className="mt-1 text-xs text-muted-foreground">Recorded at the time as {period.positionLabel} · {period.departmentLabel}</p>}
        <p className="mt-2 text-sm text-muted-foreground">{words(period.employmentType)} · {period.workLocation ?? "No location set"} · Manager: {period.manager?.legalName ?? "None"}{period.probationEndDate ? ` · Probation until ${day(period.probationEndDate)}` : ""}</p>
      </li>)}</ol></CardContent></Card>
    </div>
    <div className="grid content-start gap-5">
      <Card><CardHeader><CardTitle>At a glance</CardTitle></CardHeader><CardContent><DescriptionList columns={1} items={[["Employment", <StatusBadge key="e" status={profile.employmentStatus} />], ["Current role", current ? `${current.position?.name ?? current.positionLabel}` : null], ["Department", current ? current.department?.name ?? current.departmentLabel : null], ["Joined", day(profile.employmentPeriods.at(-1)?.startDate)]]} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Login account</CardTitle></CardHeader><CardContent><DescriptionList columns={1} items={[["Email", profile.user.email], ["Role", profile.user.role === "HR_MANAGER" ? "HR / Manager" : words(profile.user.role)], ["Account status", <StatusBadge key="a" status={profile.user.accountStatus} />], ...(profile.preorderCommissionEnabled !== undefined ? [["Pre-order commission access", profile.preorderCommissionEnabled ? "Enabled" : "Not enabled"] as [string, string]] : [])]} /></CardContent></Card>
    </div>
  </div>;
}
