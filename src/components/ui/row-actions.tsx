"use client";
import Link from "next/link";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./button";
/** Row action menu for tables: navigational actions only; mutations open their own confirmed forms. */
export function RowActions({ label, items }: { label: string; items: { label: string; href: string }[] }) {
  return <Dropdown.Root modal={false}><Dropdown.Trigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`}><MoreHorizontal size={17} aria-hidden="true" /></Button></Dropdown.Trigger>
    <Dropdown.Portal><Dropdown.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-lg border bg-surface p-1 text-sm shadow-pop">{items.map(item => <Dropdown.Item key={item.href} asChild><Link href={item.href} className="block rounded-md px-3 py-2 outline-none data-[highlighted]:bg-muted">{item.label}</Link></Dropdown.Item>)}</Dropdown.Content></Dropdown.Portal>
  </Dropdown.Root>;
}
