import { Field, SelectField } from "@/components/ui/field";
import type { employeeProfile } from "@/features/people/data";
export type EmployeeProfile = Awaited<ReturnType<typeof employeeProfile>>;
export function ContactFields({ profile }: { profile?: EmployeeProfile }) {
  const fields = [["Phone", "phone", profile?.phone, 30], ["Address", "address", profile?.address, 500], ["Emergency contact name", "emergencyName", profile?.emergencyContact.name, 100], ["Emergency contact phone", "emergencyPhone", profile?.emergencyContact.phone, 30], ["Emergency relationship", "emergencyRelationship", profile?.emergencyContact.relationship, 50]] as const;
  return <div className="grid gap-4 sm:grid-cols-2">{fields.map(([label, name, value, max]) => <Field key={name} label={label} name={name} defaultValue={value ?? ""} maxLength={max} />)}</div>;
}
export function PersonalFields({ profile }: { profile?: EmployeeProfile }) {
  return <><div className="grid gap-4 sm:grid-cols-2">
    <Field label="Employee ID" name="employeeNumber" defaultValue={profile?.employeeNumber} required maxLength={32} />
    <Field label="Full legal name" name="legalName" defaultValue={profile?.legalName} required maxLength={150} />
    <Field label="Preferred name" name="preferredName" defaultValue={profile?.preferredName ?? ""} maxLength={100} />
    <Field label="Date of birth" name="dateOfBirth" type="date" defaultValue={profile?.dateOfBirth?.toISOString().slice(0, 10)} />
    <Field label="Gender (optional)" name="gender" defaultValue={profile?.gender ?? ""} maxLength={50} />
    <Field label="Nationality" name="nationality" defaultValue={profile?.nationality ?? ""} maxLength={100} />
  </div><ContactFields profile={profile} /></>;
}
type CatalogChoice = { id: string; name: string; isActive: boolean };
export function EmploymentFields({ period, managers, employeeId, departments, positions }: { departments: CatalogChoice[]; positions: CatalogChoice[]; period?: EmployeeProfile["employmentPeriods"][number]; managers: { id: string; legalName: string; employeeNumber: string }[]; employeeId?: string }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <Field label="Join date" name="startDate" type="date" defaultValue={period?.startDate.toISOString().slice(0, 10)} required />
    <Field label="End date (exclusive, optional)" name="endDate" type="date" defaultValue={period?.endDate?.toISOString().slice(0, 10)} />
    <input type="hidden" name="departmentLabel" value={period?.departmentLabel ?? ""} /><input type="hidden" name="positionLabel" value={period?.positionLabel ?? ""} />
    <SelectField label="Department" name="departmentId" defaultValue={period?.departmentId ?? ""} required><option value="">Choose a department</option>{departments.filter(d => d.isActive || d.id === period?.departmentId).map(d => <option key={d.id} value={d.id}>{d.name}{d.isActive ? "" : " (inactive)"}</option>)}</SelectField>
    <SelectField label="Position" name="positionId" defaultValue={period?.positionId ?? ""} required><option value="">Choose a position</option>{positions.filter(d => d.isActive || d.id === period?.positionId).map(d => <option key={d.id} value={d.id}>{d.name}{d.isActive ? "" : " (inactive)"}</option>)}</SelectField>
    <SelectField label="Employment type" name="employmentType" defaultValue={period?.employmentType ?? "FULL_TIME"}>{["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "OTHER"].map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</SelectField>
    <Field label="Work location" name="workLocation" defaultValue={period?.workLocation ?? ""} maxLength={100} />
    <Field label="Probation end date" name="probationEndDate" type="date" defaultValue={period?.probationEndDate?.toISOString().slice(0, 10)} />
    <SelectField label="Manager (optional)" name="managerEmployeeId" defaultValue={period?.managerEmployeeId ?? ""}><option value="">No manager</option>{managers.filter(m => m.id !== employeeId).map(m => <option key={m.id} value={m.id}>{m.legalName} · {m.employeeNumber}</option>)}</SelectField>
  </div>;
}
