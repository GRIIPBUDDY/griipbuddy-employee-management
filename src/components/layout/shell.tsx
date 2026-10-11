import type { Actor } from "@/types/auth";
import { Navigation, type NavItem } from "./navigation";
import { ProfileMenu } from "./profile-menu";
import { UsersRound, Menu } from "lucide-react";
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
  const nav = <><p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">My workspace</p><Navigation items={personal} />{staff.length > 0 && <><p className="mb-3 mt-7 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Management</p><Navigation items={staff} /></>}</>;
  return <div className="min-h-screen bg-slate-50">
    <aside className="fixed inset-y-0 left-0 hidden w-60 overflow-y-auto border-r bg-white p-4 lg:block">
      <div className="mb-8 flex items-center gap-3 px-3 py-3"><div className="rounded-lg bg-blue-600 p-2 text-white"><UsersRound size={20} /></div><div><p className="font-semibold">GriipBuddy</p><p className="text-xs text-muted-foreground">People workspace</p></div></div>{nav}
    </aside>
    <div className="lg:pl-60"><header className="flex min-h-18 items-center justify-between gap-4 border-b bg-white px-5 py-4 sm:px-8">
      <p className="truncate text-sm font-medium text-slate-600">{companyName}</p><ProfileMenu name={actor.name} />
    </header><details className="border-b bg-white px-5 py-3 lg:hidden"><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Menu size={18} />Navigation</summary><div className="py-4">{nav}</div></details>
      <main id="main" className="mx-auto max-w-7xl space-y-7 p-5 sm:p-8">{children}</main>
    </div>
  </div>;
}
