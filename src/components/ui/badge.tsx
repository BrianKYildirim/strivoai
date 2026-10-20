import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Phase 03 · 03-10 · UI-SPEC F3 (XD-06): badges are routinely filled with
// user- or model-supplied strings (e.g. `nextBestAction.expectedImpact` on the
// LinkedIn Grader). Without `max-w-full` the badge sizes to max-content and a
// single AI-generated sentence measured 857px wide, widening the whole page.
// `max-w-full` clamps it to its container and `break-words` lets a long
// unbroken token break rather than push. Neither changes the badge's visual
// treatment at any size that already fits.
const badgeVariants = cva(
  "inline-flex max-w-full items-center break-words rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
