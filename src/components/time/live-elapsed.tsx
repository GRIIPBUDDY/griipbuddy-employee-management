"use client";
import { useEffect, useState } from "react";
const format = (total: number, showSeconds: boolean) => { const s = Math.max(0, Math.floor(total)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return showSeconds ? `${h}h ${String(m).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s` : `${h}h ${String(m).padStart(2, "0")}m`; };
/**
 * Running time since check-in. Starts from the server-rendered value and ticks every second using the
 * offset between the server and this device, so a wrong device clock does not change the display.
 */
export function LiveElapsed({ since, serverNow, seconds = true, className }: { since: string; serverNow: string; seconds?: boolean; className?: string }) {
  const start = new Date(since).getTime(), initial = (new Date(serverNow).getTime() - start) / 1000;
  const [elapsed, setElapsed] = useState(initial);
  useEffect(() => {
    const offset = new Date(serverNow).getTime() - Date.now();
    const tick = () => setElapsed((Date.now() + offset - start) / 1000);
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [start, serverNow]);
  return <time dateTime={`PT${Math.max(0, Math.floor(elapsed))}S`} className={className ?? "tabular-nums"} suppressHydrationWarning>{format(elapsed, seconds)}</time>;
}
