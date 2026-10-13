"use client";
import Link from "next/link";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, KeyRound, UserCog } from "lucide-react";
import { logoutAction } from "@/features/accounts/actions";
import { Avatar } from "@/components/ui/description-list";
const item = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-muted";
export function ProfileMenu({ name, email, role }: { name: string; email: string; role: string }) {
  return <Dropdown.Root modal={false}><Dropdown.Trigger asChild><button type="button" aria-label="Open profile menu" className="flex h-9 items-center gap-2 rounded-lg px-1.5 text-sm hover:bg-muted focus-visible:outline-2"><Avatar name={name} size={28} /><span className="hidden max-w-40 truncate font-medium sm:inline">{name}</span><ChevronDown size={15} className="text-muted-foreground" aria-hidden="true" /></button></Dropdown.Trigger>
    <Dropdown.Portal><Dropdown.Content align="end" sideOffset={8} className="z-50 w-64 rounded-xl border bg-surface p-1.5 shadow-pop">
      <div className="mb-1 flex items-center gap-3 border-b px-2.5 pb-3 pt-2"><Avatar name={name} size={36} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{name}</p><p className="truncate text-xs text-muted-foreground">{email}</p><p className="text-xs text-muted-foreground">{role}</p></div></div>
      <Dropdown.Item asChild><Link href="/account-settings" className={item}><UserCog size={16} aria-hidden="true" />Account settings</Link></Dropdown.Item>
      <Dropdown.Item asChild><Link href="/change-password" className={item}><KeyRound size={16} aria-hidden="true" />Change password</Link></Dropdown.Item>
      <Dropdown.Separator className="my-1 h-px bg-border" />
      <form action={logoutAction}><button type="submit" className={`${item} text-danger hover:bg-danger-soft`}><LogOut size={16} aria-hidden="true" />Sign out</button></form>
    </Dropdown.Content></Dropdown.Portal>
  </Dropdown.Root>;
}
