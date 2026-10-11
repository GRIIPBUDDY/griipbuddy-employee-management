import * as React from "react";
import { cn } from "@/lib/utils/cn";
export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn("flex h-11 w-full min-w-0 rounded-lg border border-input bg-white px-3 py-2 text-sm text-foreground shadow-xs outline-none placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:bg-slate-50 disabled:opacity-60", className)} {...props} />;
}
