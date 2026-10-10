// Plan 23-06a Task 1 — StreakDisplay (D-19).
// 5 variants: first-time / active / cold / expired / cap-reached.
// Copy per UI-SPEC §13.4 (locked strings).
import { motion, useReducedMotion } from "framer-motion";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StreakDisplayProps {
  lastQuizAt: string | null;
  currentStreak: number;
  longestStreak: number;
  quizzesToday: number;
  dailyCap: number;
}

type Variant = "first-time" | "active" | "cold" | "expired" | "cap-reached";

function deriveVariant(p: StreakDisplayProps): Variant {
  if (p.quizzesToday >= p.dailyCap) return "cap-reached";
  if (!p.lastQuizAt || p.currentStreak === 0) return "first-time";
  const hoursSince =
    (Date.now() - new Date(p.lastQuizAt).getTime()) / 3_600_000;
  if (hoursSince >= 48) return "expired";
  if (hoursSince >= 24) return "cold";
  return "active";
}

export function StreakDisplay(props: StreakDisplayProps) {
  const shouldReduceMotion = useReducedMotion();
  const variant = deriveVariant(props);

  // UI-SPEC §13.4 locked copy — headline byte-for-byte
  const headline =
    variant === "first-time"
      ? "Start your streak"
      : variant === "active"
        ? `${props.currentStreak}-day streak`
        : variant === "cold"
          ? `${props.currentStreak}-day streak — cooling off`
          : variant === "expired"
            ? "Streak ended"
            : "You've hit today's cap";

  const subtitle =
    variant === "active"
      ? "Quiz today to keep it going."
      : variant === "cold"
        ? `${props.quizzesToday}/${props.dailyCap} quizzes today`
        : variant === "cap-reached"
          ? "Resets at midnight UTC."
          : null;

  return (
    <div
      data-testid="streak-display"
      data-variant={variant}
      className={cn(
        "flex items-center gap-3 rounded-lg p-3",
        variant === "active" && "bg-primary/15",
        variant === "cold" && "bg-muted",
        variant === "expired" && "bg-muted opacity-60",
        variant === "cap-reached" && "bg-destructive/10",
        variant === "first-time" && "bg-accent/15",
      )}
    >
      <motion.div
        animate={shouldReduceMotion ? {} : { y: [0, -2, 0] }}
        transition={
          shouldReduceMotion
            ? {}
            : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
        }
      >
        <Flame
          className={cn(
            "w-5 h-5",
            variant === "active" ? "text-primary" : "text-muted-foreground",
          )}
        />
      </motion.div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{headline}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
