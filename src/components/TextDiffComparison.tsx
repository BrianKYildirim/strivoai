import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface TextDiffComparisonProps {
  original: string;
  improved: string;
  feedback?: string[];
  impact?: string;
  onCopy?: () => void;
}

// Simple diff algorithm to find added/removed/unchanged segments
const computeDiff = (original: string, improved: string) => {
  const originalWords = original.split(/(\s+)/);
  const improvedWords = improved.split(/(\s+)/);
  
  // Create a set of original words for quick lookup
  const originalSet = new Set(originalWords.map(w => w.toLowerCase().trim()));
  const improvedSet = new Set(improvedWords.map(w => w.toLowerCase().trim()));
  
  // Find words that were added (in improved but not original)
  const addedWords = new Set(
    improvedWords
      .filter(w => w.trim() && !originalSet.has(w.toLowerCase().trim()))
      .map(w => w.toLowerCase().trim())
  );
  
  // Find words that were removed (in original but not improved)
  const removedWords = new Set(
    originalWords
      .filter(w => w.trim() && !improvedSet.has(w.toLowerCase().trim()))
      .map(w => w.toLowerCase().trim())
  );
  
  return { addedWords, removedWords };
};

export const TextDiffComparison = ({
  original,
  improved,
  feedback,
  impact,
  onCopy
}: TextDiffComparisonProps) => {
  const [copied, setCopied] = useState(false);
  
  const { addedWords, removedWords } = computeDiff(original, improved);
  
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(improved);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
      onCopy?.();
    } catch {
      toast.error('Failed to copy');
    }
  };
  
  // Render text with highlighted changes
  const renderHighlightedText = (text: string, type: 'original' | 'improved') => {
    const words = text.split(/(\s+)/);
    
    return words.map((word, idx) => {
      const trimmedWord = word.toLowerCase().trim();
      
      if (!word.trim()) {
        return <span key={idx}>{word}</span>;
      }
      
      if (type === 'original' && removedWords.has(trimmedWord)) {
        return (
          <span 
            key={idx} 
            className="bg-red-500/20 text-red-600 px-0.5 rounded line-through decoration-red-500/50"
          >
            {word}
          </span>
        );
      }
      
      if (type === 'improved' && addedWords.has(trimmedWord)) {
        return (
          <span 
            key={idx} 
            className="bg-green-500/20 text-green-600 px-0.5 rounded font-medium"
          >
            {word}
          </span>
        );
      }
      
      return <span key={idx}>{word}</span>;
    });
  };
  
  return (
    <div className="space-y-4">
      {/* Side by Side Comparison View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Original Text */}
        <div className="p-4 bg-red-500/5 rounded-lg border border-red-500/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-red-600 font-bold text-sm uppercase tracking-wide">Before</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            {renderHighlightedText(original, 'original')}
          </p>
          {feedback && feedback.length > 0 && (
            <div className="mt-3 pt-3 border-t border-red-500/10">
              <p className="text-xs font-medium text-red-600 mb-1">Issues:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {feedback.slice(0, 3).map((issue, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-red-400 mt-0.5">•</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        {/* Improved Text */}
        <div className="p-4 bg-green-500/5 rounded-lg border border-green-500/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-green-600 font-bold text-sm uppercase tracking-wide">After</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyToClipboard}
              className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-500/10"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <p className="text-sm text-foreground font-medium leading-relaxed">
            {renderHighlightedText(improved, 'improved')}
          </p>
          {impact && (
            <div className="mt-3 pt-3 border-t border-green-500/10">
              <p className="text-xs font-medium text-green-600 mb-1">Why this works:</p>
              <p className="text-xs text-muted-foreground">{impact}</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Visual Change Indicator */}
      <div className="flex items-center justify-center gap-4 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30" />
            <span>Removed</span>
          </span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30" />
            <span>Added</span>
          </span>
        </div>
      </div>
    </div>
  );
};
