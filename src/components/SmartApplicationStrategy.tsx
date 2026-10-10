import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Crown, Lock, Target, ThumbsUp, ThumbsDown, AlertTriangle, Zap, Clock, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

interface JobRecommendation {
  title: string;
  company: string;
  matchScore: number;
  recommendation: 'apply' | 'skip' | 'maybe';
  reason: string;
  competitiveness: 'Low' | 'Medium' | 'High';
  timeToApply: string;
}

// Domain-specific default recommendations
const DOMAIN_DEFAULTS: Record<string, JobRecommendation[]> = {
  'Life Sciences & Healthcare': [
    { 
      title: 'Research Scientist', 
      company: 'Pfizer',
      matchScore: 78, 
      recommendation: 'apply', 
      reason: 'Strong alignment with your biochemistry background and lab experience. High conversion rate for similar profiles.',
      competitiveness: 'Medium',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'Clinical Research Coordinator', 
      company: 'Mayo Clinic',
      matchScore: 72, 
      recommendation: 'apply', 
      reason: 'Your research skills and attention to detail match well. Good entry point for clinical research.',
      competitiveness: 'Medium',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'Lab Technician', 
      company: 'Genentech',
      matchScore: 65, 
      recommendation: 'maybe', 
      reason: 'Good fit but consider if this aligns with your career goals. May be below your qualification level.',
      competitiveness: 'Low',
      timeToApply: '1 week'
    },
    { 
      title: 'Principal Scientist', 
      company: 'Moderna',
      matchScore: 35, 
      recommendation: 'skip', 
      reason: 'Requires 8+ years experience and PhD. Focus on entry/mid-level research roles first.',
      competitiveness: 'High',
      timeToApply: 'Not recommended'
    },
  ],
  'Technology & Engineering': [
    { 
      title: 'Software Engineer', 
      company: 'Google',
      matchScore: 75, 
      recommendation: 'apply', 
      reason: 'Strong skill alignment with your programming background. Competitive but good interview success rate.',
      competitiveness: 'High',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'Data Analyst', 
      company: 'Tech Startup',
      matchScore: 82, 
      recommendation: 'apply', 
      reason: 'Excellent match! Your analytical skills and technical experience align perfectly.',
      competitiveness: 'Low',
      timeToApply: '< 24 hours'
    },
    { 
      title: 'Junior DevOps Engineer', 
      company: 'Microsoft',
      matchScore: 58, 
      recommendation: 'maybe', 
      reason: 'Good fit but missing 1-2 key certifications. Consider after completing AWS/Azure certs.',
      competitiveness: 'Medium',
      timeToApply: '1 week'
    },
    { 
      title: 'Staff Engineer', 
      company: 'Meta',
      matchScore: 32, 
      recommendation: 'skip', 
      reason: 'Requires 10+ years experience. Focus on mid-level engineering roles first.',
      competitiveness: 'High',
      timeToApply: 'Not recommended'
    },
  ],
  'Business & Economics': [
    { 
      title: 'Financial Analyst', 
      company: 'Goldman Sachs',
      matchScore: 78, 
      recommendation: 'apply', 
      reason: 'Strong skill alignment with your quantitative background. High conversion rate for similar profiles.',
      competitiveness: 'High',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'Junior Investment Analyst', 
      company: 'Blackrock',
      matchScore: 65, 
      recommendation: 'maybe', 
      reason: 'Good fit but missing 1-2 key certifications. Consider after completing CFA Level 1.',
      competitiveness: 'Medium',
      timeToApply: '1 week'
    },
    { 
      title: 'Senior Portfolio Manager', 
      company: 'Fidelity',
      matchScore: 35, 
      recommendation: 'skip', 
      reason: 'Requires 8+ years experience. Focus on entry/mid-level roles first.',
      competitiveness: 'High',
      timeToApply: 'Not recommended'
    },
    { 
      title: 'FP&A Analyst', 
      company: 'Tech Startup',
      matchScore: 82, 
      recommendation: 'apply', 
      reason: 'Excellent match! Your Excel skills and financial modeling experience align perfectly.',
      competitiveness: 'Low',
      timeToApply: '< 24 hours'
    },
  ],
  'Social Sciences & Humanities': [
    { 
      title: 'Policy Analyst', 
      company: 'Brookings Institution',
      matchScore: 76, 
      recommendation: 'apply', 
      reason: 'Strong alignment with your research and analytical background. Good fit for your skillset.',
      competitiveness: 'Medium',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'HR Coordinator', 
      company: 'Non-Profit Organization',
      matchScore: 70, 
      recommendation: 'apply', 
      reason: 'Your communication skills and people-oriented experience match well.',
      competitiveness: 'Low',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'Content Strategist', 
      company: 'Media Company',
      matchScore: 62, 
      recommendation: 'maybe', 
      reason: 'Good fit but may need stronger portfolio. Consider after building more writing samples.',
      competitiveness: 'Medium',
      timeToApply: '1 week'
    },
    { 
      title: 'Senior Director of Policy', 
      company: 'Government Agency',
      matchScore: 30, 
      recommendation: 'skip', 
      reason: 'Requires 10+ years experience and advanced degree. Focus on analyst roles first.',
      competitiveness: 'High',
      timeToApply: 'Not recommended'
    },
  ],
  'Physical Sciences & Mathematics': [
    { 
      title: 'Data Analyst', 
      company: 'Consulting Firm',
      matchScore: 80, 
      recommendation: 'apply', 
      reason: 'Excellent fit with your quantitative and analytical background. High success rate.',
      competitiveness: 'Medium',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'Statistician', 
      company: 'Research Institute',
      matchScore: 75, 
      recommendation: 'apply', 
      reason: 'Strong alignment with your mathematics background. Good career growth potential.',
      competitiveness: 'Medium',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'Quantitative Researcher', 
      company: 'Hedge Fund',
      matchScore: 58, 
      recommendation: 'maybe', 
      reason: 'Good fit but may need stronger programming skills. Consider after Python/R certifications.',
      competitiveness: 'High',
      timeToApply: '1 week'
    },
    { 
      title: 'Lead Research Scientist', 
      company: 'National Lab',
      matchScore: 35, 
      recommendation: 'skip', 
      reason: 'Requires PhD and 5+ years experience. Focus on entry-level research roles first.',
      competitiveness: 'High',
      timeToApply: 'Not recommended'
    },
  ],
  'Creative & Design': [
    { 
      title: 'UX/UI Designer', 
      company: 'Design Agency',
      matchScore: 78, 
      recommendation: 'apply', 
      reason: 'Strong portfolio alignment. Your design skills match their needs well.',
      competitiveness: 'Medium',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'Graphic Designer', 
      company: 'Marketing Firm',
      matchScore: 82, 
      recommendation: 'apply', 
      reason: 'Excellent match! Your visual design experience is exactly what they need.',
      competitiveness: 'Low',
      timeToApply: '< 24 hours'
    },
    { 
      title: 'Product Designer', 
      company: 'Tech Startup',
      matchScore: 60, 
      recommendation: 'maybe', 
      reason: 'Good fit but may need stronger user research skills. Consider UX certification first.',
      competitiveness: 'Medium',
      timeToApply: '1 week'
    },
    { 
      title: 'Creative Director', 
      company: 'Ad Agency',
      matchScore: 32, 
      recommendation: 'skip', 
      reason: 'Requires 8+ years experience and team leadership. Focus on senior designer roles first.',
      competitiveness: 'High',
      timeToApply: 'Not recommended'
    },
  ],
  'Legal & Compliance': [
    { 
      title: 'Associate Attorney', 
      company: 'BigLaw Firm',
      matchScore: 75, 
      recommendation: 'apply', 
      reason: 'Strong academic credentials and bar passage. Good fit for your litigation interests.',
      competitiveness: 'High',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'Compliance Analyst', 
      company: 'Financial Services',
      matchScore: 80, 
      recommendation: 'apply', 
      reason: 'Excellent match! Your regulatory knowledge and attention to detail align perfectly.',
      competitiveness: 'Medium',
      timeToApply: '< 24 hours'
    },
    { 
      title: 'Paralegal', 
      company: 'Corporate Legal Dept',
      matchScore: 68, 
      recommendation: 'maybe', 
      reason: 'Good fit but may be below your qualification level. Consider if transitioning fields.',
      competitiveness: 'Low',
      timeToApply: '1 week'
    },
    { 
      title: 'Partner', 
      company: 'Law Firm',
      matchScore: 25, 
      recommendation: 'skip', 
      reason: 'Requires 8-12 years experience and significant book of business. Focus on associate roles.',
      competitiveness: 'High',
      timeToApply: 'Not recommended'
    },
  ],
  'Real Estate & Property': [
    { 
      title: 'Real Estate Analyst', 
      company: 'CBRE',
      matchScore: 78, 
      recommendation: 'apply', 
      reason: 'Strong analytical skills and real estate coursework. Good entry point for CRE.',
      competitiveness: 'Medium',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'Property Manager', 
      company: 'Property Management Co',
      matchScore: 75, 
      recommendation: 'apply', 
      reason: 'Good match with your organizational skills and customer service background.',
      competitiveness: 'Low',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'Leasing Consultant', 
      company: 'Multifamily REIT',
      matchScore: 65, 
      recommendation: 'maybe', 
      reason: 'Good entry role but sales-focused. Consider if interested in tenant-facing work.',
      competitiveness: 'Low',
      timeToApply: '1 week'
    },
    { 
      title: 'Director of Acquisitions', 
      company: 'PE Real Estate Fund',
      matchScore: 30, 
      recommendation: 'skip', 
      reason: 'Requires 7+ years experience and deal track record. Focus on analyst roles first.',
      competitiveness: 'High',
      timeToApply: 'Not recommended'
    },
  ],
  'Education & Training': [
    { 
      title: 'Teacher', 
      company: 'Public School District',
      matchScore: 82, 
      recommendation: 'apply', 
      reason: 'Excellent match! Your teaching certification and classroom experience align perfectly.',
      competitiveness: 'Low',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'Instructional Designer', 
      company: 'EdTech Startup',
      matchScore: 75, 
      recommendation: 'apply', 
      reason: 'Strong fit with your curriculum development experience and tech skills.',
      competitiveness: 'Medium',
      timeToApply: '< 48 hours'
    },
    { 
      title: 'Academic Advisor', 
      company: 'University',
      matchScore: 68, 
      recommendation: 'maybe', 
      reason: 'Good fit but may require more student affairs experience. Consider graduate assistantship.',
      competitiveness: 'Medium',
      timeToApply: '1 week'
    },
    { 
      title: 'School Principal', 
      company: 'School District',
      matchScore: 28, 
      recommendation: 'skip', 
      reason: 'Requires administrative credential and 5+ years teaching. Focus on classroom roles first.',
      competitiveness: 'High',
      timeToApply: 'Not recommended'
    },
  ],
};

function getDomainDefaults(detectedDomain?: string): JobRecommendation[] {
  if (detectedDomain && DOMAIN_DEFAULTS[detectedDomain]) {
    return DOMAIN_DEFAULTS[detectedDomain];
  }
  return DOMAIN_DEFAULTS['Business & Economics'];
}

interface SmartApplicationStrategyProps {
  tier: string;
  recommendations?: JobRecommendation[];
  detectedDomain?: string;
}

export function SmartApplicationStrategy({ tier, recommendations, detectedDomain }: SmartApplicationStrategyProps) {
  const isElite = tier === 'elite';

  // Get domain-appropriate defaults
  const domainDefaults = getDomainDefaults(detectedDomain);

  // Use provided data or fall back to domain-specific defaults
  const displayRecommendations: JobRecommendation[] = recommendations && recommendations.length > 0 ? recommendations : domainDefaults;

  // Non-Elite users see locked preview
  if (!isElite) {
    return (
      <Card className="p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background z-10" />
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <div className="p-3 rounded-full bg-amber-500/10 mb-3">
            <Crown className="h-8 w-8 text-amber-500" />
          </div>
          <h3 className="text-lg font-semibold mb-1">Smart Application Strategy</h3>
          <p className="text-sm text-muted-foreground text-center max-w-xs mb-4">
            Get personalized apply/skip recommendations to maximize your interview rate
          </p>
          <Link to="/profile">
            <Button size="sm" className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400">
              <Lock className="h-4 w-4" />
              Upgrade to Elite
            </Button>
          </Link>
        </div>
        
        {/* Blurred preview */}
        <div className="opacity-30 blur-sm pointer-events-none">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Smart Application Strategy
          </h3>
          <div className="h-64 bg-muted/20 rounded-lg" />
        </div>
      </Card>
    );
  }

  const applyJobs = displayRecommendations.filter(j => j.recommendation === 'apply');
  const maybeJobs = displayRecommendations.filter(j => j.recommendation === 'maybe');
  const skipJobs = displayRecommendations.filter(j => j.recommendation === 'skip');

  return (
    <Card className="p-6 border-amber-500/30">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Smart Application Strategy</h3>
          <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-500">Elite</Badge>
        </div>
        {detectedDomain && (
          <Badge variant="outline" className="text-xs">
            {detectedDomain}
          </Badge>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-green-500/10 rounded-lg border border-green-500/20">
          <ThumbsUp className="h-5 w-5 text-green-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-green-500">{applyJobs.length}</p>
          <p className="text-xs text-muted-foreground">Apply Now</p>
        </div>
        <div className="text-center p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-amber-500">{maybeJobs.length}</p>
          <p className="text-xs text-muted-foreground">Consider</p>
        </div>
        <div className="text-center p-3 bg-red-500/10 rounded-lg border border-red-500/20">
          <ThumbsDown className="h-5 w-5 text-red-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-red-500">{skipJobs.length}</p>
          <p className="text-xs text-muted-foreground">Skip</p>
        </div>
      </div>

      {/* Recommendations */}
      <div className="space-y-3">
        {displayRecommendations.map((job, idx) => (
          <div 
            key={idx} 
            className={`p-4 rounded-lg border ${
              job.recommendation === 'apply' ? 'bg-green-500/5 border-green-500/20' :
              job.recommendation === 'maybe' ? 'bg-amber-500/5 border-amber-500/20' :
              'bg-red-500/5 border-red-500/20'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{job.title}</span>
                  {job.recommendation === 'apply' && (
                    <Badge className="bg-green-500/20 text-green-500 text-xs">Apply</Badge>
                  )}
                  {job.recommendation === 'maybe' && (
                    <Badge className="bg-amber-500/20 text-amber-500 text-xs">Maybe</Badge>
                  )}
                  {job.recommendation === 'skip' && (
                    <Badge className="bg-red-500/20 text-red-500 text-xs">Skip</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{job.company}</p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${
                  job.matchScore >= 70 ? 'text-green-500' :
                  job.matchScore >= 50 ? 'text-amber-500' :
                  'text-red-500'
                }`}>{job.matchScore}%</p>
                <p className="text-xs text-muted-foreground">Match</p>
              </div>
            </div>
            
            <p className="text-sm text-foreground/80 mb-3">{job.reason}</p>
            
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
                <span className={`${
                  job.competitiveness === 'Low' ? 'text-green-500' :
                  job.competitiveness === 'Medium' ? 'text-amber-500' :
                  'text-red-500'
                }`}>{job.competitiveness} Competition</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">{job.timeToApply}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span><strong>Strategy Tip:</strong> Apply to your high-match roles within 48 hours for 3x higher response rates. Avoid roles with &lt;50% match to protect your response rate metrics.</span>
        </p>
      </div>
    </Card>
  );
}