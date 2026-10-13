import * as React from "react";
import { cn } from "@/lib/utils/cn";
export function Card({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="card" className={cn("min-w-0 rounded-xl border bg-card text-card-foreground shadow-card", className)} {...props} />; }
export function CardHeader({ className, actions, children, ...props }: React.ComponentProps<"div"> & { actions?: React.ReactNode }) {
  return <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pb-3 pt-5 sm:px-6", className)} {...props}><div className="min-w-0 space-y-1">{children}</div>{actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}</div>;
}
export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) { return <h2 className={cn("text-base font-semibold leading-6", className)} {...props} />; }
export function CardDescription({ className, ...props }: React.ComponentProps<"p">) { return <p className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />; }
export function CardContent({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("px-5 pb-5 sm:px-6 sm:pb-6", className)} {...props} />; }
export function CardFooter({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t bg-subtle/60 px-5 py-3 text-sm sm:px-6 rounded-b-xl", className)} {...props} />; }
