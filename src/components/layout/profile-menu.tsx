"use client";
import Link from "next/link";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, KeyRound } from "lucide-react";
import { logoutAction } from "@/features/accounts/actions";
import { Button } from "@/components/ui/button";
export function ProfileMenu({ name }: { name: string }) {
  return <Dropdown.Root><Dropdown.Trigger asChild><Button variant="ghost" className="max-w-64" aria-label="Open profile menu"><span className="truncate">{name}</span><ChevronDown size={16} /></Button></Dropdown.Trigger>
    <Dropdown.Portal><Dropdown.Content align="end" sideOffset={8} className="z-50 min-w-52 rounded-lg border bg-white p-1.5 shadow-lg">
      <Dropdown.Item asChild><Link className="flex items-center gap-2 rounded p-2 text-sm outline-none focus:bg-accent" href="/change-password"><KeyRound size={16} />Change password</Link></Dropdown.Item>
      <form action={logoutAction}><Button variant="ghost" className="w-full justify-start" type="submit"><LogOut size={16} />Sign out</Button></form>
    </Dropdown.Content></Dropdown.Portal>
  </Dropdown.Root>;
}
