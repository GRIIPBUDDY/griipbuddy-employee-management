"use client";
import { useId, useRef } from "react";
import { AlertCircle, X } from "lucide-react";
import { Button } from "./button";
export type Confirmation = { title: string; description: string; label?: string; destructive?: boolean };
export function ConfirmDialog({dialogRef, confirmation, onConfirm}: {dialogRef: React.RefObject<HTMLDialogElement | null>; confirmation: Confirmation; onConfirm: () => void}) {
  const titleId=useId(),descriptionId=useId(),cancel=useRef<HTMLButtonElement>(null);
  return <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId} className="confirm-dialog m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border bg-white p-6 text-foreground shadow-2xl backdrop:bg-slate-950/45">
    <div className="mb-4 flex items-start justify-between gap-4"><span className="rounded-xl bg-slate-100 p-2.5"><AlertCircle size={22} aria-hidden="true"/></span><Button type="button" variant="ghost" size="icon" aria-label="Close confirmation" onClick={()=>dialogRef.current?.close()}><X size={18}/></Button></div>
    <h2 id={titleId} className="text-xl font-semibold">{confirmation.title}</h2><p id={descriptionId} className="mt-3 text-sm leading-6 text-muted-foreground">{confirmation.description}</p>
    <div className="mt-6 flex justify-end gap-3"><Button ref={cancel} autoFocus type="button" variant="outline" onClick={()=>dialogRef.current?.close()}>Cancel</Button><Button type="button" variant={confirmation.destructive?"destructive":"default"} onClick={onConfirm}>{confirmation.label??"Confirm"}</Button></div>
  </dialog>;
}
