import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Target } from 'lucide-react';

interface CareerDNACardProps {
  careerDNA: string;
  detectedDomain?: string;
  domainEvidence?: string[];
}

export function CareerDNACard({ careerDNA, detectedDomain, domainEvidence }: CareerDNACardProps) {
  return (
    <Card className="p-8 text-center" style={{ borderColor: "#FF6B6B" }}>
      <div className="inline-flex items-center justify-center w-20 h-20 bg-primary/10 rounded-full mb-4">
        <Star className="w-10 h-10" style={{ color: "#FF6B6B" }} />
      </div>
      <h2 className="text-3xl font-bold mb-4">Your Career DNA</h2>

      {/* Domain Detection Badge */}
      {detectedDomain && (
        <div className="mb-4 flex items-center justify-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-sm px-3 py-1">
            <Target className="h-3 w-3 mr-1" />
            {detectedDomain}
          </Badge>
        </div>
      )}
      {domainEvidence && domainEvidence.length > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          Based on: {domainEvidence.slice(0, 5).join(", ")}
        </p>
      )}

      <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">{careerDNA}</p>
    </Card>
  );
}
