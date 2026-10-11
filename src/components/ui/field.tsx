import { Input } from "./input";
import type { ComponentProps } from "react";
export function Field({ label, name, ...props }: ComponentProps<typeof Input> & { label: string; name: string }) {
  return <label className="grid min-w-0 gap-2 text-sm font-medium"><span>{label}</span><Input name={name} {...props} /></label>;
}
export function SelectField({ label, name, children, ...props }: ComponentProps<"select"> & { label: string; name: string }) {
  return <label className="grid min-w-0 gap-2 text-sm font-medium"><span>{label}</span><select name={name} className="h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-sm shadow-xs outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:bg-slate-50" {...props}>{children}</select></label>;
}
