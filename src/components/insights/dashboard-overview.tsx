import Link from "next/link";
import { ArrowUpRight, Clock3, CheckCircle2 } from "lucide-react";
import { Card,CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
export function DashboardOverview({cards,completed,open}:{cards:{label:string;value:number;href:string}[];completed:number;open:number}){
 const attention=cards.filter(c=>/pending|awaiting|incomplete|approaching|draft/i.test(c.label));
 const grid=(items:typeof cards)=><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(c=><Link key={c.label} href={c.href} className="group rounded-xl focus-visible:outline-primary"><Card className="h-full transition-colors group-hover:border-blue-300"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><p className="max-w-48 text-sm font-medium leading-6 text-muted-foreground">{c.label}</p><ArrowUpRight aria-hidden="true" size={18} className="text-slate-400 group-hover:text-primary"/></div><p className="mt-5 text-4xl font-semibold tracking-tight tabular-nums">{c.value}</p><p className="mt-4 text-xs font-medium text-primary">View details</p></CardContent></Card></Link>)}</div>;
 return <><div className="flex flex-wrap gap-4 rounded-xl border bg-white p-4 text-sm"><span className="flex items-center gap-2"><CheckCircle2 size={17} className="text-emerald-600" aria-hidden="true"/><strong>{completed}</strong> completed sessions today</span><span className="flex items-center gap-2"><Clock3 size={17} className="text-blue-600" aria-hidden="true"/><strong>{open}</strong> currently open sessions</span></div><Tabs items={[{label:"Overview",content:grid(cards)},{label:"Needs attention",content:attention.some(c=>c.value>0)?grid(attention.filter(c=>c.value>0)):<EmptyState title="You’re all caught up" description="There are no pending actions in these operational queues."/>}]}/></>;
}
