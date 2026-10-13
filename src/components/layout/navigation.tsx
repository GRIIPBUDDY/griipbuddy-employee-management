"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Search, LayoutDashboard, UsersRound, CalendarDays, Clock3, Wallet, ClipboardList, Bell, Settings2, FileText, ShieldCheck, Building2, BriefcaseBusiness, Palmtree, Boxes, LoaderCircle, Timer, FilePenLine, ArrowLeftRight, CalendarRange, Receipt, SlidersHorizontal, BadgePercent, Star, TriangleAlert, BarChart3, ScrollText, UserRound, NotebookText, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
export type NavItem = { href: string; label: string; icon?: string; badge?: number };
export type NavGroup = { label: string; items: NavItem[]; collapsible?: boolean };
const icons: Record<string, typeof FileText> = { dashboard: LayoutDashboard, notifications: Bell, employees: UsersRound, departments: Building2, positions: BriefcaseBusiness, documents: FileText, records: NotebookText, accounts: ShieldCheck,
  schedule: CalendarDays, attendance: Clock3, corrections: FilePenLine, overtime: Timer, swaps: ArrowLeftRight, tasks: ClipboardList, leave: Palmtree, weekly: CalendarRange, salary: Wallet, adjustments: SlidersHorizontal,
  percent: BadgePercent, performance: Star, warnings: TriangleAlert, assets: Boxes, reports: BarChart3, audit: ScrollText, settings: Settings2, profile: UserRound, receipt: Receipt };
export function activeNavigation(items: NavItem[], path: string) { return items.filter(item => path === item.href || path.startsWith(item.href + "/")).sort((a, b) => b.href.length - a.href.length)[0]; }
function NavigationProgress() { const { pending } = useLinkStatus(); return pending ? <LoaderCircle aria-label="Loading page" size={14} className="ml-auto shrink-0 animate-spin text-muted-foreground" /> : null; }
export function Navigation({ groups }: { groups: NavGroup[] }) {
  const path = usePathname(), [search, setSearch] = useState(""), active = activeNavigation(groups.flatMap(g => g.items), path);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (label: string, defaultCollapsed: boolean) => setCollapsed(current => ({ ...current, [label]: !(current[label] ?? defaultCollapsed) }));
  const query = search.trim().toLowerCase(), filtered = groups.map(group => ({ ...group, items: group.items.filter(i => i.label.toLowerCase().includes(query) || group.label.toLowerCase().includes(query)) })).filter(g => g.items.length);
  return <>
    <label className="relative mb-4 block"><span className="sr-only">Find a page</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input value={search} onChange={e => setSearch(e.target.value)} type="search" placeholder="Find a page…" className="h-9 w-full rounded-lg border bg-subtle pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus-visible:border-primary focus-visible:bg-surface focus-visible:ring-3 focus-visible:ring-primary/15" /></label>
    <nav aria-label="Workspace navigation" className="space-y-5">{filtered.map(group => {
      const hidden = !query && group.collapsible && (collapsed[group.label] ?? !group.items.some(i => i.href === active?.href));
      return <div key={group.label}>
        {group.collapsible ? <button type="button" aria-expanded={!hidden} onClick={() => toggle(group.label, !group.items.some(i => i.href === active?.href))} className="mb-1 flex w-full items-center justify-between rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.08em] text-slate-500 hover:text-foreground">{group.label}<ChevronDown size={14} aria-hidden="true" className={cn("transition-transform", hidden && "-rotate-90")} /></button>
          : <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[.08em] text-slate-500">{group.label}</p>}
        {!hidden && <ul className="space-y-0.5">{group.items.map(item => {
          const Icon = icons[item.icon ?? ""] ?? FileText, current = active?.href === item.href;
          return <li key={item.href}><Link href={item.href} aria-current={current ? "page" : undefined} className={cn("group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors", current ? "bg-primary-soft text-primary" : "text-[#344054] hover:bg-muted hover:text-foreground")}>
            {current && <span aria-hidden="true" className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-primary" />}
            <Icon aria-hidden="true" size={16} className={cn("shrink-0", current ? "text-primary" : "text-slate-500 group-hover:text-foreground")} /><span className="truncate">{item.label}</span>
            {!!item.badge && <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-[18px] text-white tabular-nums">{item.badge > 99 ? "99+" : item.badge}</span>}<NavigationProgress /></Link></li>;
        })}</ul>}
      </div>;
    })}{!filtered.length && <p className="px-2.5 text-sm text-muted-foreground">No pages match “{search}”.</p>}</nav>
  </>;
}
