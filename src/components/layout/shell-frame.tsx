"use client";
import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, UsersRound, X } from "lucide-react";
import { ProfileMenu } from "./profile-menu";
import { Navigation, activeNavigation, type NavGroup } from "./navigation";
import { Button } from "@/components/ui/button";
import { Toasts } from "@/components/ui/toasts";
export function ShellFrame({groups,companyName,name,role,unread,children}:{groups:NavGroup[];companyName:string;name:string;role:string;unread:number;children:React.ReactNode}){
 const drawer=useRef<HTMLDialogElement>(null),path=usePathname(),active=activeNavigation(groups.flatMap(g=>g.items),path);
 const brand=<Link href="/dashboard" className="mb-7 flex items-center gap-3 px-2"><span className="rounded-xl bg-blue-500 p-2.5 text-white"><UsersRound size={22} aria-hidden="true"/></span><span><span className="block font-semibold tracking-tight text-white">GriipBuddy</span><span className="text-xs text-slate-400">People & operations</span></span></Link>;
 const sidebar=<>{brand}<Navigation groups={groups}/><p className="mt-8 border-t border-slate-800 px-3 pt-5 text-xs leading-5 text-slate-400">{companyName}<span className="block">{role==="ADMIN"?"Administrator":role==="HR_MANAGER"?"HR / Manager":"Employee workspace"}</span></p></>;
 return <div className="min-h-screen bg-background"><aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto bg-slate-950 p-5 lg:block">{sidebar}</aside>
 <div className="min-w-0 lg:pl-64"><header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-3 border-b bg-white/95 px-4 backdrop-blur-sm sm:px-8"><div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" aria-label="Open navigation" className="lg:hidden" onClick={()=>drawer.current?.showModal()}><Menu size={20}/></Button><div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{companyName}</p><p className="mt-1 truncate text-sm font-semibold">{active?.label??"Workspace"}</p></div></div><div className="flex shrink-0 items-center gap-1 sm:gap-3"><Button asChild variant="ghost" size="icon"><Link href="/notifications" aria-label={`Notifications, ${unread} unread`} className="relative"><Bell size={19}/>{unread>0&&<span className="absolute right-0 top-0 rounded-full bg-blue-600 px-1.5 text-[10px] font-bold leading-4 text-white">{unread>99?"99+":unread}</span>}</Link></Button><span className="hidden h-6 border-l sm:block"/><ProfileMenu name={name}/></div></header>
 <main id="main" className="workspace-main mx-auto max-w-[1440px] min-w-0 space-y-7 p-4 sm:p-8 lg:p-10">{children}</main></div>
 <dialog ref={drawer} aria-label="Workspace navigation" className="m-0 h-dvh max-h-none w-80 max-w-[90vw] overflow-y-auto border-0 bg-slate-950 p-5 text-white backdrop:bg-slate-950/50"><div className="mb-3 flex justify-end"><Button variant="ghost" size="icon" aria-label="Close navigation" onClick={()=>drawer.current?.close()}><X size={20}/></Button></div><div onClick={e=>{if((e.target as HTMLElement).closest('a'))drawer.current?.close();}}>{sidebar}</div></dialog><Toasts/></div>;
}
