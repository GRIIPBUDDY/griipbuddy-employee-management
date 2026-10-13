import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "./button";
import { cn } from "@/lib/utils/cn";
type Query = Record<string, string | string[] | undefined>;
export function pageHref(query: Query, page: number, key = "page", path = "") {
  const q = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== key && e[1] !== ""));
  if (page > 1) q.set(key, String(page));
  const s = q.toString();
  return `${path}${s ? `?${s}` : path ? "" : "?"}`;
}
/** Server-rendered pagination preserving the current filters. Works with either a known page count or a hasNext flag. */
export function Pagination({ page, pages, hasNext, total, query = {}, path = "", pageKey = "page", noun = "records", className }: { page: number; pages?: number; hasNext?: boolean; total?: number; query?: Query; path?: string; pageKey?: string; noun?: string; className?: string }) {
  const next = pages !== undefined ? page < pages : !!hasNext, previous = page > 1;
  if (!next && !previous && total === undefined) return null;
  const disabled = "pointer-events-none opacity-45";
  return <nav aria-label="Pagination" className={cn("flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground", className)}>
    <p>{total !== undefined ? <><span className="font-medium text-foreground">{total}</span> {noun}</> : null}{pages !== undefined && pages > 1 ? <span>{total !== undefined ? " · " : ""}Page {page} of {pages}</span> : pages === undefined && (previous || next) ? <span>Page {page}</span> : null}</p>
    {(previous || next) && <div className="flex gap-2"><Link aria-disabled={!previous} tabIndex={previous ? undefined : -1} href={pageHref(query, page - 1, pageKey, path)} className={cn(buttonVariants({ variant: "outline", size: "sm" }), !previous && disabled)}><ChevronLeft size={15} aria-hidden="true" />Previous</Link><Link aria-disabled={!next} tabIndex={next ? undefined : -1} href={pageHref(query, page + 1, pageKey, path)} className={cn(buttonVariants({ variant: "outline", size: "sm" }), !next && disabled)}>Next<ChevronRight size={15} aria-hidden="true" /></Link></div>}
  </nav>;
}
