import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Phase 03 · 03-10 · UI-SPEC F1/F3: at the base breakpoint "all copy wraps; no
// horizontal scroll". An unconditional `whitespace-nowrap` made every button's
// min-content width equal to its full label, so a full-width CTA inside a
// narrow grid column pushed the whole document sideways (XD-07, XD-09). Labels
// now wrap below `md`; at `md`+ the original single-line behaviour is kept
// byte-for-byte.
const buttonVariants = cva(
  "inline-flex touch-manipulation items-center justify-center gap-2 whitespace-normal text-center md:whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Phase 24 brand-v2 (D-18): 8px radius, brand-red accent, JetBrains Mono label.
        // Usable only inside a .theme-v2 scope (no bleed into Phases 15–23).
        boxy: "rounded-boxy bg-[--accent-red] text-[--text-primary] font-mono uppercase tracking-wide hover:brightness-110",
        "boxy-outline": "rounded-boxy border-2 border-[--accent-red] bg-transparent text-[--accent-red] font-mono uppercase tracking-wide hover:bg-[--accent-red] hover:text-white",
      },
      // UI-SPEC F4 (XD-11): every interactive element needs a >= 44x44 CSS px
      // HIT AREA on a touch device. The floor is applied with `min-h`/`min-w`
      // below `md` only, so the desktop box is byte-for-byte what it was; on a
      // phone the box grows to the WCAG 2.5.5 floor without the icon, label or
      // any spacing token changing.
      size: {
        default: "min-h-11 md:min-h-0 h-10 px-4 py-2",
        sm: "min-h-11 md:min-h-0 h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "min-h-11 min-w-11 md:min-h-0 md:min-w-0 h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
