"use client";
import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Building } from "lucide-react";
import { ProfileMenu } from "./profile-menu";
import { NotificationMenu } from "./notification-menu";
import { Navigation, activeNavigation, type NavGroup } from "./navigation";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/page-header";
import { Toasts } from "@/components/ui/toasts";
export function ShellFrame({ groups, companyName, name, email, role, unread, onHold, children }: { groups: NavGroup[]; companyName: string; name: string; email: string; role: string; unread: number; onHold: boolean; children: React.ReactNode }) {
  const drawer = useRef<HTMLDialogElement>(null), path = usePathname(), items = groups.flatMap(g => g.items), active = activeNavigation(items, path), group = groups.find(g => g.items.includes(active!));
  const crumbs = [...(group && group.label !== "Overview" ? [{ label: group.label }] : []), ...(active ? [{ label: active.label, href: active.href }] : [{ label: "Workspace" }])];
  const sidebar = <div className="flex min-h-full flex-col">
    <Link href="/dashboard" className="mb-5 flex items-center gap-3 rounded-lg px-1.5 py-1"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white shadow-xs"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18.5 19c-.3-1.6-1-2.9-2-3.8" /></svg></span><span className="min-w-0"><span className="block text-sm font-semibold leading-5">GriipBuddy People</span><span className="block truncate text-xs text-muted-foreground">Workforce operations</span></span></Link>
    <Navigation groups={groups} />
    <div className="mt-auto pt-6"><div className="flex items-center gap-2 rounded-lg border bg-subtle px-3 py-2.5 text-xs"><Building size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" /><span className="min-w-0"><span className="block truncate font-medium text-foreground">{companyName}</span><span className="text-muted-foreground">{role}</span></span></div></div>
  </div>;
  return <div className="min-h-screen bg-background">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto border-r bg-surface px-4 py-5 lg:block">{sidebar}</aside>
    <div className="min-w-0 lg:pl-64">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-surface/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon-sm" aria-label="Open navigation" className="lg:hidden" onClick={() => drawer.current?.showModal()}><Menu size={19} /></Button><Breadcrumbs items={crumbs} className="hidden sm:block" /><span className="truncate text-sm font-semibold sm:hidden">{active?.label ?? "Workspace"}</span></div>
        <div className="flex shrink-0 items-center gap-1"><NotificationMenu unread={unread} /><span className="mx-1 hidden h-6 border-l sm:block" /><ProfileMenu name={name} email={email} role={role} /></div>
      </header>
      {onHold && <div role="status" className="border-b border-[#fedf89] bg-warning-soft px-4 py-2 text-center text-sm text-[#7a2e0e] sm:px-6">Your account is on hold. You can view your records, but check-in, task updates and other operational actions are unavailable. Contact HR for assistance.</div>}
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] min-w-0 space-y-6 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
    <dialog ref={drawer} aria-label="Workspace navigation" className="m-0 h-dvh max-h-none w-72 max-w-[85vw] overflow-y-auto border-0 border-r bg-surface px-4 py-4 shadow-pop">
      <div className="mb-2 flex justify-end"><Button variant="ghost" size="icon-sm" aria-label="Close navigation" onClick={() => drawer.current?.close()}><X size={18} /></Button></div>
      <div onClick={e => { if ((e.target as HTMLElement).closest("a")) drawer.current?.close(); }}>{sidebar}</div>
    </dialog>
    <Toasts />
  </div>;
}
