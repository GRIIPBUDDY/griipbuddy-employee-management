import { Input } from "./input";
import type { ComponentProps } from "react";
export function Field({ label, name, ...props }: ComponentProps<typeof Input> & { label: string; name: string }) {
  return <label className="grid min-w-0 gap-2 text-sm font-medium"><span>{label}</span><Input name={name} {...props} /></label>;
}
export function SelectField({ label, name, children, ...props }: ComponentProps<"select"> & { label: string; name: string }) {
  return <label className="grid min-w-0 gap-2 text-sm font-medium"><span>{label}</span><select name={name} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" {...props}>{children}</select></label>;
}
