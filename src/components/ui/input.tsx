import * as React from "react";
import { cn } from "@/lib/utils/cn";
export const controlClass = "w-full min-w-0 rounded-lg border border-input bg-surface px-3 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-slate-400 hover:border-[#b9c0cc] focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-danger";
export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(controlClass, "h-10 py-2 read-only:bg-subtle file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-sm file:font-medium", type === "file" && "h-auto py-2", className)} {...props} />;
}
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(controlClass, "min-h-24 py-2.5 leading-6", className)} {...props} />;
}
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(controlClass, "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%23667085%22 stroke-width=%222%22 viewBox=%220 0 24 24%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_.65rem_center] bg-no-repeat pr-9", className)} {...props} />;
}
