import { cn } from "@/lib/utils";

export interface CharacterCounterProps {
  value: number;
  max?: number;
  className?: string;
}

export function CharacterCounter({ value, max = 500, className }: CharacterCounterProps) {
  const isExactMax = value === max;
  const isOver = value > max;
  return (
    <div className={cn("text-right", className)}>
      <span
        data-testid="char-counter"
        className={cn(
          "text-xs tabular-nums",
          !isExactMax && !isOver && "text-muted-foreground",
          isExactMax && "text-primary",
          isOver && "text-destructive",
        )}
      >
        {value}/{max}
      </span>
      {isOver && (
        <p className="text-xs text-destructive mt-1">
          Keep your answer to {max} characters or fewer.
        </p>
      )}
    </div>
  );
}
