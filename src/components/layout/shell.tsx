import type { Actor } from "@/types/auth";
import type { NavGroup } from "./navigation";
import { ShellFrame } from "./shell-frame";
/**
 * Navigation is derived from the actor's server-side permissions. Unavailable features are omitted entirely
 * (never shown disabled), so employees without pre-order access see no trace of that feature.
 */
export function navigationFor(actor: Actor, unread: number): NavGroup[] {
  const groups: NavGroup[] = [{ label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }, { href: "/notifications", label: "Notifications", icon: "notifications", badge: unread }] }];
  const personal = !!actor.employeeId && actor.employmentActive, commissions = actor.preorderCommissionEnabled && personal;
  if (actor.role !== "EMPLOYEE") {
    const manageCommissions = actor.role === "ADMIN" || actor.canManageCommissions;
    groups.push(
      { label: "People", items: [{ href: "/manage/employees", label: "Employees", icon: "employees" }, { href: "/manage/departments", label: "Departments", icon: "departments" }, { href: "/manage/positions", label: "Positions", icon: "positions" }, { href: "/manage/documents", label: "Documents", icon: "documents" }, { href: "/manage/work-records", label: "Work records", icon: "records" }, ...(actor.role === "ADMIN" ? [{ href: "/manage/accounts", label: "User accounts", icon: "accounts" }] : [])] },
      { label: "Workforce", items: [{ href: "/manage/schedule", label: "Schedules", icon: "schedule" }, { href: "/manage/attendance", label: "Attendance", icon: "attendance" }, { href: "/manage/corrections", label: "Corrections", icon: "corrections" }, { href: "/manage/overtime", label: "Overtime review", icon: "overtime" }, { href: "/manage/shift-swaps", label: "Shift swaps", icon: "swaps" }, { href: "/manage/tasks", label: "Tasks", icon: "tasks" }, { href: "/manage/leave", label: "Leave & holidays", icon: "leave" }] },
      { label: "Compensation", items: [{ href: "/manage/weekly-earnings", label: "Weekly earnings", icon: "weekly" }, { href: "/manage/salary", label: "Salary & payments", icon: "salary" }, { href: "/manage/adjustments", label: "Adjustments", icon: "adjustments" }, ...(manageCommissions ? [{ href: "/manage/commissions", label: "Pre-order commissions", icon: "percent" }] : [])] },
      { label: "HR records", items: [{ href: "/manage/performance", label: "Performance", icon: "performance" }, { href: "/manage/warnings", label: "Warnings", icon: "warnings" }, { href: "/manage/assets", label: "Assets", icon: "assets" }] },
      { label: "Insights", items: [{ href: "/manage/reports", label: "Reports", icon: "reports" }, { href: "/manage/audit", label: "Audit log", icon: "audit" }, ...(actor.role === "ADMIN" ? [{ href: "/manage/settings", label: "Settings", icon: "settings" }] : [])] },
    );
    if (personal) groups.push({ label: "My workspace", collapsible: true, items: [{ href: "/me", label: "My profile", icon: "profile" }, { href: "/me/schedule", label: "My schedule", icon: "schedule" }, { href: "/me/attendance", label: "My attendance", icon: "attendance" }, { href: "/me/tasks", label: "My tasks", icon: "tasks" }, { href: "/me/leave", label: "My leave", icon: "leave" }, { href: "/me/weekly-earnings", label: "My earnings", icon: "weekly" }, { href: "/me/salary", label: "My salary", icon: "salary" }, ...(commissions ? [{ href: "/me/commissions", label: "My pre-orders", icon: "percent" }] : [])] });
  } else if (personal) groups.push(
    { label: "My work", items: [{ href: "/me/schedule", label: "Schedule", icon: "schedule" }, { href: "/me/attendance", label: "Attendance", icon: "attendance" }, { href: "/me/overtime", label: "Overtime", icon: "overtime" }, { href: "/me/tasks", label: "Tasks", icon: "tasks" }, { href: "/me/shift-swaps", label: "Shift swaps", icon: "swaps" }, { href: "/me/corrections", label: "Corrections", icon: "corrections" }] },
    { label: "My pay", items: [{ href: "/me/weekly-earnings", label: "Earnings", icon: "weekly" }, { href: "/me/salary", label: "Salary statements", icon: "salary" }, { href: "/me/compensation", label: "Compensation", icon: "adjustments" }, ...(commissions ? [{ href: "/me/commissions", label: "Pre-order commission", icon: "percent" }] : [])] },
    { label: "My records", items: [{ href: "/me", label: "Profile", icon: "profile" }, { href: "/me/documents", label: "Documents", icon: "documents" }, { href: "/me/leave", label: "Leave", icon: "leave" }, { href: "/me/performance", label: "Performance", icon: "performance" }, { href: "/me/warnings", label: "Notices", icon: "warnings" }, { href: "/me/work-records", label: "Work records", icon: "records" }, { href: "/me/assets", label: "Assets", icon: "assets" }] },
  );
  return groups;
}
export function AppShell({ actor, companyName, unread, children }: { actor: Actor; companyName: string; unread: number; children: React.ReactNode }) {
  const role = actor.role === "ADMIN" ? "Administrator" : actor.role === "HR_MANAGER" ? "HR / Manager" : "Employee";
  return <ShellFrame groups={navigationFor(actor, unread)} name={actor.name} email={actor.email} role={role} companyName={companyName} unread={unread} onHold={actor.accountStatus === "ON_HOLD"}>{children}</ShellFrame>;
}
