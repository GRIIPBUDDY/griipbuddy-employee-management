import { Field, SelectField, FieldGrid } from "@/components/ui/field";
import type { employeeProfile } from "@/features/people/data";
export type EmployeeProfile = Awaited<ReturnType<typeof employeeProfile>>;
const words = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase());
export function ContactFields({ profile }: { profile?: EmployeeProfile }) {
  return <><FieldGrid><Field label="Phone" name="phone" type="tel" defaultValue={profile?.phone ?? ""} maxLength={30} autoComplete="tel" /><Field label="Address" name="address" defaultValue={profile?.address ?? ""} maxLength={500} autoComplete="street-address" /></FieldGrid>
    <FieldGrid columns={3}><Field label="Emergency contact name" name="emergencyName" defaultValue={profile?.emergencyContact.name ?? ""} maxLength={100} /><Field label="Emergency contact phone" name="emergencyPhone" type="tel" defaultValue={profile?.emergencyContact.phone ?? ""} maxLength={30} /><Field label="Relationship" name="emergencyRelationship" defaultValue={profile?.emergencyContact.relationship ?? ""} maxLength={50} /></FieldGrid></>;
}
export function PersonalFields({ profile }: { profile?: EmployeeProfile }) {
  return <FieldGrid>
    <Field label="Employee ID" name="employeeNumber" defaultValue={profile?.employeeNumber} required maxLength={32} />
    <Field label="Full legal name" name="legalName" defaultValue={profile?.legalName} required maxLength={150} />
    <Field label="Preferred name" name="preferredName" defaultValue={profile?.preferredName ?? ""} maxLength={100} hint="Shown in greetings and navigation." />
    <Field label="Date of birth" name="dateOfBirth" type="date" defaultValue={profile?.dateOfBirth?.toISOString().slice(0, 10)} />
    <Field label="Gender" name="gender" defaultValue={profile?.gender ?? ""} maxLength={50} hint="Optional." />
    <Field label="Nationality" name="nationality" defaultValue={profile?.nationality ?? ""} maxLength={100} />
  </FieldGrid>;
}
type CatalogChoice = { id: string; name: string; isActive: boolean };
export function EmploymentFields({ period, managers, employeeId, departments, positions }: { departments: CatalogChoice[]; positions: CatalogChoice[]; period?: EmployeeProfile["employmentPeriods"][number]; managers: { id: string; legalName: string; employeeNumber: string }[]; employeeId?: string }) {
  return <FieldGrid>
    <Field label="Join date" name="startDate" type="date" defaultValue={period?.startDate.toISOString().slice(0, 10)} required />
    <Field label="Employment end date" name="endDate" type="date" defaultValue={period?.endDate?.toISOString().slice(0, 10)} hint="Optional. The first day the person is no longer employed." />
    <input type="hidden" name="departmentLabel" value={period?.departmentLabel ?? ""} /><input type="hidden" name="positionLabel" value={period?.positionLabel ?? ""} />
    <SelectField label="Department" name="departmentId" defaultValue={period?.departmentId ?? ""} required><option value="">Choose a department</option>{departments.filter(d => d.isActive || d.id === period?.departmentId).map(d => <option key={d.id} value={d.id}>{d.name}{d.isActive ? "" : " (inactive)"}</option>)}</SelectField>
    <SelectField label="Position" name="positionId" defaultValue={period?.positionId ?? ""} required><option value="">Choose a position</option>{positions.filter(d => d.isActive || d.id === period?.positionId).map(d => <option key={d.id} value={d.id}>{d.name}{d.isActive ? "" : " (inactive)"}</option>)}</SelectField>
    <SelectField label="Employment type" name="employmentType" defaultValue={period?.employmentType ?? "FULL_TIME"}>{["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "OTHER"].map(type => <option key={type} value={type}>{words(type)}</option>)}</SelectField>
    <Field label="Work location" name="workLocation" defaultValue={period?.workLocation ?? ""} maxLength={100} />
    <Field label="Probation end date" name="probationEndDate" type="date" defaultValue={period?.probationEndDate?.toISOString().slice(0, 10)} />
    <SelectField label="Manager" name="managerEmployeeId" defaultValue={period?.managerEmployeeId ?? ""}><option value="">No manager</option>{managers.filter(m => m.id !== employeeId).map(m => <option key={m.id} value={m.id}>{m.legalName} · {m.employeeNumber}</option>)}</SelectField>
  </FieldGrid>;
}
