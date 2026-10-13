"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
/** Shows server-confirmed success messages dispatched by ActionForm. */
export function Toasts() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { const receive = (event: Event) => setMessage((event as CustomEvent<string>).detail); window.addEventListener("workspace:saved", receive); return () => window.removeEventListener("workspace:saved", receive); }, []);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(null), 6000); return () => clearTimeout(timer); }, [message]);
  return <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex justify-end sm:inset-x-auto sm:right-5">{message && <div role="status" className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-xl border bg-surface p-4 text-sm shadow-pop"><CheckCircle2 aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-success" /><p className="leading-6">{message}</p><button type="button" onClick={() => setMessage(null)} aria-label="Dismiss notification" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X size={15} /></button></div>}</div>;
}
