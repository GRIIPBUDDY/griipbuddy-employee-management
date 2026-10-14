/** Client-safe catalog of optional modules and editable lists. */
export const modules = [
  { key: "tasks", label: "Tasks", description: "Assign tasks to employees and track completion.", default: true, paths: ["/manage/tasks", "/me/tasks"] },
  { key: "shiftSwaps", label: "Shift swaps", description: "Employees propose swaps; the colleague accepts and staff approve.", default: true, paths: ["/manage/shift-swaps", "/me/shift-swaps"] },
  { key: "commissions", label: "Pre-order commissions", description: "Commission claims, approvals and rechecks included in salary.", default: true, paths: ["/manage/commissions", "/me/commissions"] },
  { key: "performance", label: "Performance reviews", description: "Published performance reviews on employee records.", default: true, paths: ["/manage/performance", "/me/performance"] },
  { key: "warnings", label: "Warnings & notices", description: "Disciplinary notices with employee acknowledgement.", default: true, paths: ["/manage/warnings", "/me/warnings"] },
  { key: "incidents", label: "Incident & performance records", description: "Mistakes, incidents, corrective actions and positive records, with employee responses.", default: true, paths: ["/manage/incidents", "/me/incidents"] },
  { key: "assets", label: "Assets", description: "Company equipment inventory and assignments.", default: true, paths: ["/manage/assets", "/me/assets"] },
  { key: "workRecords", label: "Work records", description: "Achievements, training and notes on the employee timeline.", default: true, paths: ["/manage/work-records", "/me/work-records"] },
  { key: "weeklyEarnings", label: "Weekly earning statements (legacy)", description: "Only for months that already use weekly statements. Salary is monthly.", default: false, paths: ["/manage/weekly-earnings", "/me/weekly-earnings"] },
] as const;
export type ModuleKey = typeof modules[number]["key"];
export const optionLists = [
  { key: "LEAVE_CATEGORY", label: "Leave types", description: "Paid or unpaid by default, with an optional yearly allowance in days." },
  { key: "ADJUSTMENT_CATEGORY", label: "Salary adjustment types", description: "Each type adds to pay (bonus), reduces pay (deduction) or is another signed adjustment." },
  { key: "DOCUMENT_TYPE", label: "Document types", description: "Categories for private employee documents." },
  { key: "ASSET_TYPE", label: "Asset types", description: "Categories for company equipment." },
  { key: "EMPLOYMENT_TYPE", label: "Employment types", description: "Used on employment records." },
] as const;
export type OptionList = typeof optionLists[number]["key"];
export const adjustmentKinds = { BONUS: "Adds to pay", DEDUCTION: "Reduces pay", OTHER: "Signed amount (+ or −)" } as const;
export const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** Disabled module paths, used to hide navigation entries. */
export function disabledPaths(state: Record<ModuleKey, boolean>) { return modules.filter(m => !state[m.key]).flatMap(m => [...m.paths]); }
