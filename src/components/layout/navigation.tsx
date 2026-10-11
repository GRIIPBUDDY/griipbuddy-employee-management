"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Search, LayoutDashboard, UsersRound, CalendarDays, Clock3, Wallet, ClipboardList, Bell, Settings2, FileText, ShieldCheck, Building2, BriefcaseBusiness, HeartHandshake, Boxes, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
export type NavItem={href:string;label:string};
export type NavGroup={label:string;items:NavItem[]};
const icons: Record<string,typeof FileText>={dashboard:LayoutDashboard,employees:UsersRound,accounts:ShieldCheck,attendance:Clock3,overtime:Clock3,schedule:CalendarDays,"shift-swaps":CalendarDays,salary:Wallet,"weekly-earnings":Wallet,commissions:Wallet,tasks:ClipboardList,notifications:Bell,settings:Settings2,"account-settings":Settings2,departments:Building2,positions:BriefcaseBusiness,leave:HeartHandshake,assets:Boxes,me:UsersRound};
export function activeNavigation(items:NavItem[],path:string){return items.filter(item=>path===item.href||path.startsWith(item.href+"/")).sort((a,b)=>b.href.length-a.href.length)[0];}
function NavigationProgress(){const {pending}=useLinkStatus();return <span className="ml-auto h-4 w-4 shrink-0">{pending&&<LoaderCircle aria-label="Loading page" size={16} className="animate-spin"/>}</span>;}
export function Navigation({groups}:{groups:NavGroup[]}){
 const path=usePathname(),[search,setSearch]=useState(""),active=activeNavigation(groups.flatMap(g=>g.items),path);
 const filtered=groups.map(group=>({...group,items:group.items.filter(i=>i.label.toLowerCase().includes(search.toLowerCase()))})).filter(g=>g.items.length);
 return <><label className="relative mb-6 block"><span className="sr-only">Find a page</span><Search size={16} className="absolute left-3 top-3.5 text-slate-400" aria-hidden="true"/><input value={search} onChange={e=>setSearch(e.target.value)} type="search" placeholder="Find a page…" className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-400"/></label>
 <nav aria-label="Workspace navigation" className="space-y-6">{filtered.map(group=><div key={group.label}><p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">{group.label}</p><div className="space-y-1">{group.items.map(item=>{const Icon=icons[item.href.split('/').at(-1)??""]??FileText;return <Link key={item.href} href={item.href} aria-current={active?.href===item.href?"page":undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white",active?.href===item.href&&"bg-blue-500/15 text-blue-200 ring-1 ring-inset ring-blue-400/25")}><Icon aria-hidden="true" size={17} className="shrink-0"/><span>{item.label}</span><NavigationProgress/></Link>;})}</div></div>)}{!filtered.length&&<p className="px-3 text-sm text-slate-400">No pages match this search.</p>}</nav></>;
}
