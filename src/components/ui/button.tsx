import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-sun-400 text-navy-950 hover:bg-sun-500",
        secondary: "bg-navy-800 text-white hover:bg-navy-950",
        outline: "border border-line bg-surface text-ink hover:bg-bg",
        ghost: "text-ink hover:bg-bg",
        danger: "bg-danger text-white hover:opacity-90",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant }), className)} {...props} />;
}
