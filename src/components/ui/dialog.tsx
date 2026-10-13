"use client";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils/cn";
type Variant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
/**
 * Progressive disclosure for create/edit/decision forms. Native <dialog> gives focus containment and Escape.
 * Content remounts on every open so stale success/error state never carries over, and the dialog closes
 * itself after a contained ActionForm reports a server-confirmed success ("action:success").
 */
export function Dialog({ trigger, title, description, children, variant = "outline", size = "md", sheet = false, triggerSize = "default", triggerClassName, triggerLabel, defaultOpen = false }: { trigger: React.ReactNode; title: string; description?: React.ReactNode; children: React.ReactNode; variant?: Variant; size?: "sm" | "md" | "lg" | "xl"; sheet?: boolean; triggerSize?: "default" | "sm" | "icon-sm"; triggerClassName?: string; triggerLabel?: string; defaultOpen?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null), body = useRef<HTMLDivElement>(null), titleId = useId(), [generation, setGeneration] = useState(defaultOpen ? 1 : 0);
  const open = () => { setGeneration(g => g + 1); ref.current?.showModal(); };
  useEffect(() => { if (defaultOpen) ref.current?.showModal(); }, [defaultOpen]);
  useEffect(() => {
    const node = body.current; if (!node) return;
    const done = () => ref.current?.close();
    node.addEventListener("action:success", done);
    return () => node.removeEventListener("action:success", done);
  }, []);
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return <>
    <Button type="button" variant={variant} size={triggerSize} className={triggerClassName} aria-label={triggerLabel} aria-haspopup="dialog" onClick={open}>{trigger}</Button>
    <dialog ref={ref} aria-labelledby={titleId} onClick={event => { if (event.target === ref.current) ref.current?.close(); }}
      className={cn("border bg-surface p-0 text-left shadow-pop", sheet ? "my-0 ml-auto mr-0 h-dvh max-h-none w-full max-w-xl rounded-none border-y-0 border-r-0 sm:max-w-2xl" : cn("m-auto w-[calc(100%-1.5rem)] rounded-2xl", width))}>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-surface px-5 py-4 sm:px-6"><div className="min-w-0"><h2 id={titleId} className="text-base font-semibold">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>}</div><Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={() => ref.current?.close()}><X size={18} aria-hidden="true" /></Button></div>
      <div ref={body} className="px-5 py-5 sm:px-6">{generation > 0 && <div key={generation}>{children}</div>}</div>
    </dialog>
  </>;
}
