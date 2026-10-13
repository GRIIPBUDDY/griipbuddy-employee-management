"use client";
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
type Item = { label: string; content: React.ReactNode; id?: string; count?: number };
/** In-page tabs with roving keyboard focus. Items with an id are selectable through the URL hash (e.g. #documents). */
export function Tabs({ items, label = "Views" }: { items: Item[]; label?: string }) {
  const [selected, setSelected] = useState(0), id = useId(), ids = items.map(item => item.id ?? "").join("|");
  useEffect(() => {
    const sync = () => { const index = ids.split("|").findIndex(key => key && `#${key}` === window.location.hash); if (index >= 0) setSelected(index); };
    sync(); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync);
  }, [ids]);
  const choose = (index: number) => { setSelected(index); const target = items[index].id; if (target) history.replaceState(null, "", `#${target}`); };
  return <div className="min-w-0"><div role="tablist" aria-label={label} className="mb-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-muted p-1">{items.map((item, index) => <button key={item.label} id={`${id}-${index}-tab`} type="button" role="tab" aria-selected={selected === index} aria-controls={`${id}-${index}-panel`} tabIndex={selected === index ? 0 : -1}
    className={cn("flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40", selected === index ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
    onClick={() => choose(index)} onKeyDown={e => { let next: number; if (e.key === "ArrowRight") next = (index + 1) % items.length; else if (e.key === "ArrowLeft") next = (index + items.length - 1) % items.length; else if (e.key === "Home") next = 0; else if (e.key === "End") next = items.length - 1; else return; e.preventDefault(); choose(next); document.getElementById(`${id}-${next}-tab`)?.focus(); }}>
    {item.label}{item.count !== undefined && <span className={cn("rounded-full px-1.5 text-xs tabular-nums", selected === index ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground")}>{item.count}</span>}</button>)}</div>
    {items.map((item, index) => <section key={item.label} role="tabpanel" id={`${id}-${index}-panel`} aria-labelledby={`${id}-${index}-tab`} hidden={selected !== index} className="min-w-0 space-y-5 outline-none">{item.content}</section>)}</div>;
}
/** Route-level tabs. The most specific href matching the current path and query is active. */
export function TabNav({ items, label }: { items: { label: string; href: string; count?: number; exact?: boolean }[]; label: string }) {
  const path = usePathname(), search = useSearchParams();
  const score = (href: string, exact?: boolean) => {
    const url = new URL(href, "http://local");
    if (exact ? url.pathname !== path : url.pathname !== path && !path.startsWith(url.pathname + "/")) return -1;
    for (const [key, value] of url.searchParams) if (search.get(key) !== value) return -1;
    return url.pathname.length * 10 + [...url.searchParams].length;
  };
  const scores = items.map(item => score(item.href, item.exact)), best = Math.max(...scores);
  return <nav aria-label={label} className="flex max-w-full gap-1 overflow-x-auto border-b">{items.map((item, index) => { const on = best >= 0 && scores[index] === best; return <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined} className={cn("-mb-px flex h-10 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors", on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{item.label}{item.count !== undefined && item.count > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{item.count}</span>}</Link>; })}</nav>;
}
