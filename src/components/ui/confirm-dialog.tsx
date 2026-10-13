"use client";
import { useId } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils/cn";
export type Confirmation = { title: string; description: string; label?: string; destructive?: boolean };
export function ConfirmDialog({ dialogRef, confirmation, onConfirm }: { dialogRef: React.RefObject<HTMLDialogElement | null>; confirmation: Confirmation; onConfirm: () => void }) {
  const titleId = useId(), descriptionId = useId(), Icon = confirmation.destructive ? AlertTriangle : HelpCircle;
  return <dialog ref={dialogRef} role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId} className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border bg-surface p-6 shadow-pop">
    <div className="flex items-start gap-4"><span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", confirmation.destructive ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary")}><Icon size={20} aria-hidden="true" /></span>
      <div className="min-w-0"><h2 id={titleId} className="text-base font-semibold">{confirmation.title}</h2><p id={descriptionId} className="mt-2 text-sm leading-6 text-muted-foreground">{confirmation.description}</p></div></div>
    <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button autoFocus type="button" variant="outline" onClick={() => dialogRef.current?.close()}>Cancel</Button><Button type="button" variant={confirmation.destructive ? "destructive" : "default"} onClick={onConfirm}>{confirmation.label ?? "Confirm"}</Button></div>
  </dialog>;
}
