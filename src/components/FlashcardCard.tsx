import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Copy, Check } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────
interface FlashcardCardProps {
  question: string;
  competency: string;
  answer: { situation: string; task: string; action: string; result: string };
  index: number;
}

// ── Component ──────────────────────────────────────────────────────
export function FlashcardCard({ question, competency, answer, index }: FlashcardCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = [
      `Situation: ${answer.situation}`,
      `Task: ${answer.task}`,
      `Action: ${answer.action}`,
      `Result: ${answer.result}`,
    ].join('\n\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: silently fail if clipboard API is unavailable
    }
  };

  return (
    <Card className="border border-border bg-card">
      <CardContent className="p-6 relative">
        {/* Copy button - top right */}
        <div className="absolute top-4 right-4">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleCopy}
                  aria-label="Copy answer"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy answer</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Question header */}
        <div className="flex items-start gap-3 mb-4 pr-10">
          <h3 className="text-lg font-semibold text-foreground">
            Q{index + 1}. {question}
          </h3>
          <Badge variant="outline" className="text-xs flex-shrink-0 mt-0.5">
            {competency}
          </Badge>
        </div>

        {/* STAR answer sections */}
        <div className="space-y-2">
          <div>
            <span className="font-medium text-primary text-sm">Situation:</span>{" "}
            <span className="text-sm text-muted-foreground">{answer.situation}</span>
          </div>
          <div>
            <span className="font-medium text-primary text-sm">Task:</span>{" "}
            <span className="text-sm text-muted-foreground">{answer.task}</span>
          </div>
          <div>
            <span className="font-medium text-primary text-sm">Action:</span>{" "}
            <span className="text-sm text-muted-foreground">{answer.action}</span>
          </div>
          <div>
            <span className="font-medium text-primary text-sm">Result:</span>{" "}
            <span className="text-sm text-muted-foreground">{answer.result}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
