"use client";
import { useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-dropdown-menu";
import { Bell, LoaderCircle } from "lucide-react";
type Item = { id: string; title: string; text: string; href: string; readAt: string | null; createdAt: string };
/** Loads the recipient's own authorized notifications on demand from the existing scoped API. */
export function NotificationMenu({ unread }: { unread: number }) {
  const [items, setItems] = useState<Item[] | null>(null), [failed, setFailed] = useState(false);
  const load = async (open: boolean) => {
    if (!open) return;
    try { const response = await fetch("/api/me/notifications/page?status=UNREAD", { cache: "no-store" }); if (!response.ok) throw new Error(); setItems(((await response.json()).records as Item[]).slice(0, 6)); setFailed(false); }
    catch { setFailed(true); }
  };
  const time = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  return <Popover.Root modal={false} onOpenChange={open => void load(open)}><Popover.Trigger asChild><button type="button" aria-label={`Notifications, ${unread} unread`} className="relative grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2"><Bell size={18} aria-hidden="true" />{unread > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-white ring-2 ring-surface">{unread > 99 ? "99+" : unread}</span>}</button></Popover.Trigger>
    <Popover.Portal><Popover.Content align="end" sideOffset={8} className="z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border bg-surface shadow-pop">
      <div className="flex items-center justify-between border-b px-4 py-3"><p className="text-sm font-semibold">Notifications</p><span className="text-xs text-muted-foreground">{unread} unread</span></div>
      <div className="max-h-96 overflow-y-auto p-1.5">{failed ? <p className="p-3 text-sm text-muted-foreground">Notifications could not be loaded. Open the full list to retry.</p> : items === null ? <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><LoaderCircle size={15} className="animate-spin" aria-hidden="true" />Loading…</p> : items.length === 0 ? <p className="p-3 text-sm text-muted-foreground">You’re all caught up.</p> : items.map(item => <Popover.Item key={item.id} asChild><Link href={item.href} className="block rounded-lg px-3 py-2.5 outline-none data-[highlighted]:bg-muted"><p className="flex items-center gap-2 text-sm font-medium"><span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{item.title}</p><p className="mt-0.5 line-clamp-2 pl-3.5 text-sm text-muted-foreground">{item.text}</p><p className="mt-1 pl-3.5 text-xs text-slate-400">{time(item.createdAt)}</p></Link></Popover.Item>)}</div>
      <div className="border-t p-1.5"><Popover.Item asChild><Link href="/notifications" className="block rounded-lg px-3 py-2 text-center text-sm font-medium text-primary outline-none data-[highlighted]:bg-muted">View all notifications</Link></Popover.Item></div>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
