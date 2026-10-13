import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";
// Hierarchy: one primary action per area; outline for secondary; ghost for low-emphasis; destructive for irreversible decisions.
const buttonVariants = cva("inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary-strong",
      destructive: "bg-danger text-white shadow-xs hover:bg-[#912018]",
      outline: "border border-border-strong bg-surface text-foreground shadow-xs hover:bg-subtle",
      secondary: "bg-primary-soft text-primary hover:bg-[#e2e7fc]",
      ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
      link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
    },
    size: { default: "h-10 px-4", sm: "h-8 rounded-md px-3 text-[13px]", lg: "h-11 px-5", icon: "h-10 w-10", "icon-sm": "h-8 w-8 rounded-md" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
export { Button, buttonVariants };
