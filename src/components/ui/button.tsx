import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";
const buttonVariants = cva("inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", {
  variants: { variant: { default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90", destructive: "bg-rose-700 text-white shadow-sm hover:bg-rose-800", outline: "border border-input bg-white text-slate-700 shadow-xs hover:bg-accent", ghost: "hover:bg-accent hover:text-accent-foreground" },
    size: { default: "min-h-11 px-4 py-2.5", sm: "min-h-10 px-3 py-2", icon: "h-11 w-11" } }, defaultVariants: { variant: "default", size: "default" },
});
function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
export { Button, buttonVariants };
