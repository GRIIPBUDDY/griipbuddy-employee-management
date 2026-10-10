"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
export type NavItem = { href: string; label: string };
export function Navigation({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return <nav aria-label="Main navigation" className="space-y-1">{items.map(item => <Link key={item.href} href={item.href} aria-current={path === item.href ? "page" : undefined} className={cn("block rounded-lg px-3 py-2.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900", path === item.href && "bg-blue-50 font-semibold text-blue-700")}>{item.label}</Link>)}</nav>;
}
