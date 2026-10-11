"use client";
import Link from "next/link";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, KeyRound, Settings2 } from "lucide-react";
import { logoutAction } from "@/features/accounts/actions";
import { Button } from "@/components/ui/button";
export function ProfileMenu({ name }: { name: string }) {
  return <Dropdown.Root><Dropdown.Trigger asChild><Button variant="ghost" className="max-w-64" aria-label="Open profile menu"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-800">{name.split(" ").slice(0,2).map(n=>n[0]).join("")}</span><span className="hidden max-w-36 truncate sm:inline">{name}</span><ChevronDown size={16} /></Button></Dropdown.Trigger>
    <Dropdown.Portal><Dropdown.Content align="end" sideOffset={8} className="z-50 min-w-52 rounded-lg border bg-white p-1.5 shadow-lg">
      <div className="mb-1 border-b px-3 py-2"><p className="text-xs text-muted-foreground">Signed in as</p><p className="mt-1 max-w-52 truncate text-sm font-semibold">{name}</p></div><Dropdown.Item asChild><Link href="/account-settings" className="flex items-center gap-2 rounded p-2 text-sm outline-none focus:bg-accent"><Settings2 size={16}/>Account settings</Link></Dropdown.Item><Dropdown.Item asChild><Link className="flex items-center gap-2 rounded p-2 text-sm outline-none focus:bg-accent" href="/change-password"><KeyRound size={16} />Change password</Link></Dropdown.Item>
      <form action={logoutAction}><Button variant="ghost" className="w-full justify-start" type="submit"><LogOut size={16} />Sign out</Button></form>
    </Dropdown.Content></Dropdown.Portal>
  </Dropdown.Root>;
}
