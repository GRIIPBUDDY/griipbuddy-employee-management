import type { Actor } from "@/types/auth";
import type { NavItem, NavGroup } from "./navigation";
import { ShellFrame } from "./shell-frame";
export function AppShell({ actor, companyName, unread, children }: { actor: Actor; companyName: string; unread: number; children: React.ReactNode }) {
  const personal: NavItem[] = [{ href: "/account-settings", label: "Account settings" },{ href: "/dashboard", label: "Dashboard" }, { href: "/notifications", label: `Notifications (${unread})` }];
  if (actor.employeeId && actor.employmentActive) {
    personal.push({ href: "/me", label: "My profile" }, { href: "/me/shift-swaps", label: "Shift swaps" }, { href: "/me/tasks", label: "Tasks" }, { href: "/me/weekly-earnings", label: "Earnings" }, { href: "/me/corrections", label: "Attendance corrections" }, { href: "/me/overtime", label: "Weekly overtime" }, ...["attendance", "schedule", "leave", "salary", "documents", "performance", "warnings", "work-records", "assets"].map(module => ({ href: `/me/${module}`, label: module === "work-records" ? "Work records" : module[0].toUpperCase() + module.slice(1) })));
    if (actor.preorderCommissionEnabled) personal.push({ href: "/me/commissions", label: "Pre-order commission" });
  }
  const staff: NavItem[] = actor.role === "EMPLOYEE" ? [] : [
    { href: "/manage/shift-swaps", label: "Shift swap approvals" }, { href: "/manage/tasks", label: "Tasks" }, { href: "/manage/weekly-earnings", label: "Weekly earnings" }, { href: "/manage/reports", label: "Reports" }, { href: "/manage/audit", label: "Audit review" },
    { href: "/manage/employees", label: "Employees" }, { href: "/manage/corrections", label: "Correction review" }, { href: "/manage/overtime", label: "Overtime review" },
    { href: "/manage/departments", label: "Departments" }, { href: "/manage/positions", label: "Positions" },
    ...["attendance", "schedule", "leave", "salary", "documents", "performance", "warnings", "work-records", "assets"].map(module => ({ href: `/manage/${module}`, label: module === "work-records" ? "Work records" : module[0].toUpperCase() + module.slice(1) })),
    ...(actor.role === "ADMIN" || actor.canManageCommissions ? [{ href: "/manage/commissions", label: "Pre-orders & commissions" }] : []),
    ...(actor.role === "ADMIN" ? [{ href: "/manage/accounts", label: "User accounts" }, { href: "/manage/settings", label: "Settings" }] : []),
  ];
  const operationModules=new Set(["attendance","schedule","leave","corrections","overtime","tasks","shift-swaps"]);
  const payModules=new Set(["salary","weekly-earnings","commissions"]);
  const groups:NavGroup[]=[{label:"Workspace",items:personal}];
  if(staff.length){
    groups.push({label:"People",items:staff.filter(i=>!operationModules.has(i.href.split("/").at(-1)!)&&!payModules.has(i.href.split("/").at(-1)!)&&!['accounts','settings','reports','audit'].includes(i.href.split("/").at(-1)!))});
    groups.push({label:"Operations",items:staff.filter(i=>operationModules.has(i.href.split("/").at(-1)!))});
    groups.push({label:"Compensation",items:staff.filter(i=>payModules.has(i.href.split("/").at(-1)!))});
    groups.push({label:"Administration",items:staff.filter(i=>['accounts','settings','reports','audit'].includes(i.href.split("/").at(-1)!))});
  }
  return <ShellFrame groups={groups.filter(g=>g.items.length)} name={actor.name} role={actor.role} companyName={companyName} unread={unread}>{children}</ShellFrame>;
}
