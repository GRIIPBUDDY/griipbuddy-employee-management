import { Input, Select, Textarea } from "./input";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
function Label({ label, hint, required, children, className }: { label: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return <label className={cn("grid min-w-0 content-start gap-1.5 text-sm", className)}><span className="font-medium text-foreground">{label}{required && <span aria-hidden="true" className="ml-0.5 text-danger">*</span>}</span>{children}{hint && <span className="text-xs leading-5 text-muted-foreground">{hint}</span>}</label>;
}
export function Field({ label, name, hint, className, ...props }: ComponentProps<typeof Input> & { label: string; name: string; hint?: ReactNode }) {
  return <Label label={label} hint={hint} required={props.required} className={className}><Input name={name} {...props} /></Label>;
}
export function SelectField({ label, name, hint, children, className, ...props }: ComponentProps<"select"> & { label: string; name: string; hint?: ReactNode }) {
  return <Label label={label} hint={hint} required={props.required} className={className}><Select name={name} {...props}>{children}</Select></Label>;
}
export function TextAreaField({ label, name, hint, className, ...props }: ComponentProps<"textarea"> & { label: string; name: string; hint?: ReactNode }) {
  return <Label label={label} hint={hint} required={props.required} className={className}><Textarea name={name} {...props} /></Label>;
}
export function CheckboxField({ label, description, className, ...props }: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return <label className={cn("flex items-start gap-3 rounded-lg text-sm", className)}><input type="checkbox" className="mt-0.5" {...props} /><span className="grid gap-0.5"><span className="font-medium">{label}</span>{description && <span className="text-xs leading-5 text-muted-foreground">{description}</span>}</span></label>;
}
/** Two-column settings-style form section: heading/description on the left, fields on the right. */
export function FormSection({ title, description, children, className }: { title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cn("grid gap-x-8 gap-y-4 border-t pt-6 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]", className)}><div><h3 className="text-sm font-semibold">{title}</h3>{description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>}</div><div className="grid min-w-0 gap-4">{children}</div></section>;
}
export function FieldGrid({ children, columns = 2, className }: { children: ReactNode; columns?: 2 | 3 | 4; className?: string }) {
  return <div className={cn("grid min-w-0 gap-4", columns === 2 ? "sm:grid-cols-2" : columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}
