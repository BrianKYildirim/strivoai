import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Crown, Lock, DollarSign, TrendingUp, ArrowRight, Briefcase, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';

interface SalaryData {
  role: string;
  entryLevel: string;
  midLevel: string;
  seniorLevel: string;
  yourEstimate: string;
  percentile: number;
}

interface RoleTransition {
  from: string;
  to: string;
  salaryIncrease: string;
  timeToTransition: string;
  roi: string;
  difficulty: 'Easy' | 'Moderate' | 'Challenging';
}

// Domain-specific default data
const DOMAIN_DEFAULTS: Record<string, { salaryData: SalaryData[]; transitions: RoleTransition[] }> = {
  'Life Sciences & Healthcare': {
    salaryData: [
      { role: 'Research Scientist', entryLevel: '$55,000 - $75,000', midLevel: '$80,000 - $110,000', seniorLevel: '$120,000 - $160,000', yourEstimate: '$60,000', percentile: 40 },
      { role: 'Lab Technician', entryLevel: '$40,000 - $55,000', midLevel: '$55,000 - $75,000', seniorLevel: '$75,000 - $95,000', yourEstimate: '$48,000', percentile: 45 },
      { role: 'Clinical Research Coordinator', entryLevel: '$50,000 - $65,000', midLevel: '$65,000 - $85,000', seniorLevel: '$90,000 - $120,000', yourEstimate: '$55,000', percentile: 42 },
    ],
    transitions: [
      { from: 'Research Assistant', to: 'Research Scientist', salaryIncrease: '+45%', timeToTransition: '2-3 years', roi: '200%', difficulty: 'Moderate' },
      { from: 'Lab Technician', to: 'Quality Control Manager', salaryIncrease: '+55%', timeToTransition: '3-4 years', roi: '180%', difficulty: 'Moderate' },
      { from: 'Research Scientist', to: 'Principal Scientist', salaryIncrease: '+40%', timeToTransition: '4-6 years', roi: '220%', difficulty: 'Challenging' },
    ]
  },
  'Technology & Engineering': {
    salaryData: [
      { role: 'Software Engineer', entryLevel: '$75,000 - $100,000', midLevel: '$110,000 - $150,000', seniorLevel: '$160,000 - $220,000', yourEstimate: '$85,000', percentile: 50 },
      { role: 'Data Scientist', entryLevel: '$80,000 - $105,000', midLevel: '$115,000 - $155,000', seniorLevel: '$165,000 - $230,000', yourEstimate: '$90,000', percentile: 48 },
      { role: 'Product Manager', entryLevel: '$85,000 - $110,000', midLevel: '$120,000 - $165,000', seniorLevel: '$175,000 - $250,000', yourEstimate: '$95,000', percentile: 45 },
    ],
    transitions: [
      { from: 'Junior Developer', to: 'Senior Developer', salaryIncrease: '+50%', timeToTransition: '2-3 years', roi: '250%', difficulty: 'Moderate' },
      { from: 'Software Engineer', to: 'Engineering Manager', salaryIncrease: '+40%', timeToTransition: '4-5 years', roi: '200%', difficulty: 'Challenging' },
      { from: 'Data Analyst', to: 'Data Scientist', salaryIncrease: '+35%', timeToTransition: '1-2 years', roi: '180%', difficulty: 'Easy' },
    ]
  },
  'Business & Economics': {
    salaryData: [
      { role: 'Financial Analyst', entryLevel: '$55,000 - $70,000', midLevel: '$75,000 - $95,000', seniorLevel: '$100,000 - $130,000', yourEstimate: '$62,000', percentile: 45 },
      { role: 'Investment Analyst', entryLevel: '$65,000 - $85,000', midLevel: '$90,000 - $120,000', seniorLevel: '$130,000 - $180,000', yourEstimate: '$72,000', percentile: 35 },
      { role: 'Corporate Finance', entryLevel: '$60,000 - $80,000', midLevel: '$85,000 - $110,000', seniorLevel: '$120,000 - $160,000', yourEstimate: '$68,000', percentile: 40 },
    ],
    transitions: [
      { from: 'Financial Analyst', to: 'Senior Financial Analyst', salaryIncrease: '+35%', timeToTransition: '2-3 years', roi: '180%', difficulty: 'Moderate' },
      { from: 'Financial Analyst', to: 'Finance Manager', salaryIncrease: '+55%', timeToTransition: '4-5 years', roi: '220%', difficulty: 'Challenging' },
      { from: 'Financial Analyst', to: 'FP&A Analyst', salaryIncrease: '+20%', timeToTransition: '1-2 years', roi: '150%', difficulty: 'Easy' },
    ]
  },
  'Social Sciences & Humanities': {
    salaryData: [
      { role: 'Policy Analyst', entryLevel: '$50,000 - $65,000', midLevel: '$70,000 - $90,000', seniorLevel: '$95,000 - $130,000', yourEstimate: '$55,000', percentile: 42 },
      { role: 'Human Resources Specialist', entryLevel: '$45,000 - $60,000', midLevel: '$65,000 - $85,000', seniorLevel: '$90,000 - $120,000', yourEstimate: '$52,000', percentile: 48 },
      { role: 'Communications Specialist', entryLevel: '$45,000 - $60,000', midLevel: '$60,000 - $80,000', seniorLevel: '$85,000 - $115,000', yourEstimate: '$50,000', percentile: 44 },
    ],
    transitions: [
      { from: 'Policy Analyst', to: 'Senior Policy Advisor', salaryIncrease: '+40%', timeToTransition: '3-4 years', roi: '170%', difficulty: 'Moderate' },
      { from: 'HR Specialist', to: 'HR Manager', salaryIncrease: '+45%', timeToTransition: '3-5 years', roi: '190%', difficulty: 'Moderate' },
      { from: 'Content Strategist', to: 'Communications Director', salaryIncrease: '+60%', timeToTransition: '5-7 years', roi: '210%', difficulty: 'Challenging' },
    ]
  },
  'Physical Sciences & Mathematics': {
    salaryData: [
      { role: 'Data Analyst', entryLevel: '$55,000 - $75,000', midLevel: '$80,000 - $105,000', seniorLevel: '$110,000 - $145,000', yourEstimate: '$65,000', percentile: 48 },
      { role: 'Quantitative Analyst', entryLevel: '$75,000 - $100,000', midLevel: '$110,000 - $150,000', seniorLevel: '$160,000 - $220,000', yourEstimate: '$85,000', percentile: 40 },
      { role: 'Research Scientist', entryLevel: '$60,000 - $80,000', midLevel: '$85,000 - $115,000', seniorLevel: '$120,000 - $160,000', yourEstimate: '$70,000', percentile: 45 },
    ],
    transitions: [
      { from: 'Data Analyst', to: 'Senior Data Analyst', salaryIncrease: '+35%', timeToTransition: '2-3 years', roi: '175%', difficulty: 'Easy' },
      { from: 'Statistician', to: 'Lead Statistician', salaryIncrease: '+40%', timeToTransition: '3-4 years', roi: '185%', difficulty: 'Moderate' },
      { from: 'Research Scientist', to: 'Principal Scientist', salaryIncrease: '+50%', timeToTransition: '5-7 years', roi: '200%', difficulty: 'Challenging' },
    ]
  },
  'Creative & Design': {
    salaryData: [
      { role: 'UX/UI Designer', entryLevel: '$55,000 - $75,000', midLevel: '$80,000 - $110,000', seniorLevel: '$120,000 - $160,000', yourEstimate: '$65,000', percentile: 50 },
      { role: 'Graphic Designer', entryLevel: '$42,000 - $58,000', midLevel: '$60,000 - $80,000', seniorLevel: '$85,000 - $115,000', yourEstimate: '$50,000', percentile: 45 },
      { role: 'Art Director', entryLevel: '$55,000 - $75,000', midLevel: '$80,000 - $110,000', seniorLevel: '$115,000 - $155,000', yourEstimate: '$62,000', percentile: 42 },
    ],
    transitions: [
      { from: 'Junior Designer', to: 'Senior Designer', salaryIncrease: '+45%', timeToTransition: '2-3 years', roi: '190%', difficulty: 'Moderate' },
      { from: 'UX Designer', to: 'Lead UX Designer', salaryIncrease: '+40%', timeToTransition: '3-4 years', roi: '180%', difficulty: 'Moderate' },
      { from: 'Art Director', to: 'Creative Director', salaryIncrease: '+50%', timeToTransition: '4-6 years', roi: '220%', difficulty: 'Challenging' },
    ]
  },
  'Legal & Compliance': {
    salaryData: [
      { role: 'Associate Attorney', entryLevel: '$80,000 - $120,000', midLevel: '$130,000 - $180,000', seniorLevel: '$200,000 - $350,000', yourEstimate: '$95,000', percentile: 45 },
      { role: 'Paralegal', entryLevel: '$45,000 - $60,000', midLevel: '$60,000 - $80,000', seniorLevel: '$80,000 - $100,000', yourEstimate: '$52,000', percentile: 50 },
      { role: 'Compliance Officer', entryLevel: '$55,000 - $75,000', midLevel: '$80,000 - $110,000', seniorLevel: '$120,000 - $160,000', yourEstimate: '$65,000', percentile: 42 },
    ],
    transitions: [
      { from: 'Associate Attorney', to: 'Senior Associate', salaryIncrease: '+40%', timeToTransition: '3-4 years', roi: '200%', difficulty: 'Moderate' },
      { from: 'Paralegal', to: 'Senior Paralegal', salaryIncrease: '+35%', timeToTransition: '2-3 years', roi: '170%', difficulty: 'Easy' },
      { from: 'Senior Associate', to: 'Partner', salaryIncrease: '+100%', timeToTransition: '6-10 years', roi: '350%', difficulty: 'Challenging' },
    ]
  },
  'Real Estate & Property': {
    salaryData: [
      { role: 'Real Estate Analyst', entryLevel: '$55,000 - $75,000', midLevel: '$80,000 - $110,000', seniorLevel: '$120,000 - $160,000', yourEstimate: '$65,000', percentile: 48 },
      { role: 'Property Manager', entryLevel: '$45,000 - $60,000', midLevel: '$65,000 - $85,000', seniorLevel: '$90,000 - $120,000', yourEstimate: '$52,000', percentile: 50 },
      { role: 'Commercial Broker', entryLevel: '$50,000 - $80,000', midLevel: '$100,000 - $200,000', seniorLevel: '$200,000 - $500,000+', yourEstimate: '$70,000', percentile: 40 },
    ],
    transitions: [
      { from: 'Real Estate Analyst', to: 'Senior Analyst', salaryIncrease: '+40%', timeToTransition: '2-3 years', roi: '190%', difficulty: 'Moderate' },
      { from: 'Leasing Agent', to: 'Commercial Broker', salaryIncrease: '+80%', timeToTransition: '3-5 years', roi: '250%', difficulty: 'Moderate' },
      { from: 'Asset Manager', to: 'Director of Acquisitions', salaryIncrease: '+50%', timeToTransition: '4-6 years', roi: '220%', difficulty: 'Challenging' },
    ]
  },
  'Education & Training': {
    salaryData: [
      { role: 'Teacher (K-12)', entryLevel: '$40,000 - $55,000', midLevel: '$55,000 - $75,000', seniorLevel: '$75,000 - $95,000', yourEstimate: '$48,000', percentile: 45 },
      { role: 'Instructional Designer', entryLevel: '$55,000 - $70,000', midLevel: '$75,000 - $95,000', seniorLevel: '$100,000 - $130,000', yourEstimate: '$62,000', percentile: 48 },
      { role: 'University Professor', entryLevel: '$60,000 - $80,000', midLevel: '$85,000 - $120,000', seniorLevel: '$130,000 - $200,000', yourEstimate: '$70,000', percentile: 42 },
    ],
    transitions: [
      { from: 'Teacher', to: 'Department Head', salaryIncrease: '+25%', timeToTransition: '5-7 years', roi: '150%', difficulty: 'Moderate' },
      { from: 'Instructional Designer', to: 'Director of Learning', salaryIncrease: '+50%', timeToTransition: '4-6 years', roi: '200%', difficulty: 'Moderate' },
      { from: 'Assistant Professor', to: 'Full Professor', salaryIncrease: '+60%', timeToTransition: '7-12 years', roi: '180%', difficulty: 'Challenging' },
    ]
  },
};

// Fallback to a generic default based on closest match
function getDomainDefaults(detectedDomain?: string): { salaryData: SalaryData[]; transitions: RoleTransition[] } {
  if (detectedDomain && DOMAIN_DEFAULTS[detectedDomain]) {
    return DOMAIN_DEFAULTS[detectedDomain];
  }
  // Default fallback (general)
  return DOMAIN_DEFAULTS['Business & Economics'];
}

interface CompensationIntelligenceProps {
  tier: string;
  targetRole?: string;
  currentSalary?: string;
  salaryData?: SalaryData[];
  roleTransitions?: RoleTransition[];
  detectedDomain?: string;
}

export function CompensationIntelligence({ 
  tier, 
  targetRole,
  salaryData,
  roleTransitions,
  detectedDomain
}: CompensationIntelligenceProps) {
  const isElite = tier === 'elite';

  // Get domain-appropriate defaults
  const domainDefaults = getDomainDefaults(detectedDomain);

  // Use provided data or fall back to domain-specific defaults
  const displaySalaryData: SalaryData[] = salaryData && salaryData.length > 0 ? salaryData : domainDefaults.salaryData;
  const displayTransitions: RoleTransition[] = roleTransitions && roleTransitions.length > 0 ? roleTransitions : domainDefaults.transitions;

  // Derive display target role
  const displayTargetRole = targetRole || displaySalaryData[0]?.role || 'Target Role';

  // Non-Elite users see locked preview
  if (!isElite) {
    return (
      <Card className="p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background z-10" />
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <div className="p-3 rounded-full bg-amber-500/10 mb-3">
            <Crown className="h-8 w-8 text-amber-500" />
          </div>
          <h3 className="text-lg font-semibold mb-1">Compensation Intelligence</h3>
          <p className="text-sm text-muted-foreground text-center max-w-xs mb-4">
            Unlock salary bands, role transition ROI, and career earnings optimization
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
            <DollarSign className="h-5 w-5 text-green-500" />
            Compensation Intelligence
          </h3>
          <div className="h-64 bg-muted/20 rounded-lg" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-amber-500/30">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-500" />
          <h3 className="text-lg font-semibold">Compensation Intelligence</h3>
          <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-500">Elite</Badge>
        </div>
        {detectedDomain && (
          <Badge variant="outline" className="text-xs">
            {detectedDomain}
          </Badge>
        )}
      </div>

      {/* Salary Bands */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          Salary Bands by Experience Level
        </h4>
        <div className="space-y-3">
          {displaySalaryData.map((data, idx) => (
            <div key={idx} className="p-4 bg-muted/20 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{data.role}</span>
                <Badge variant="outline" className="text-xs">
                  Your estimate: {data.yourEstimate}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                <div className="text-center p-2 bg-background/50 rounded">
                  <p className="text-muted-foreground mb-1">Entry</p>
                  <p className="font-medium">{data.entryLevel}</p>
                </div>
                <div className="text-center p-2 bg-background/50 rounded">
                  <p className="text-muted-foreground mb-1">Mid</p>
                  <p className="font-medium">{data.midLevel}</p>
                </div>
                <div className="text-center p-2 bg-background/50 rounded">
                  <p className="text-muted-foreground mb-1">Senior</p>
                  <p className="font-medium">{data.seniorLevel}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Your percentile:</span>
                <Progress value={data.percentile} className="flex-1 h-2" />
                <span className="text-xs font-medium">{data.percentile}th</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Role Transition ROI */}
      <div>
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Role Transition ROI
        </h4>
        <div className="space-y-3">
          {displayTransitions.map((transition, idx) => (
            <div key={idx} className="p-4 bg-muted/20 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">{transition.from}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">{transition.to}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 bg-green-500/10 rounded">
                  <p className="text-lg font-bold text-green-500">{transition.salaryIncrease}</p>
                  <p className="text-[10px] text-muted-foreground">Salary Gain</p>
                </div>
                <div className="p-2 bg-background/50 rounded">
                  <p className="text-sm font-semibold">{transition.timeToTransition}</p>
                  <p className="text-[10px] text-muted-foreground">Timeline</p>
                </div>
                <div className="p-2 bg-primary/10 rounded">
                  <p className="text-sm font-semibold text-primary">{transition.roi}</p>
                  <p className="text-[10px] text-muted-foreground">ROI</p>
                </div>
                <div className="p-2 bg-background/50 rounded">
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] ${
                      transition.difficulty === 'Easy' ? 'text-green-500 border-green-500/30' :
                      transition.difficulty === 'Moderate' ? 'text-amber-500 border-amber-500/30' :
                      'text-red-500 border-red-500/30'
                    }`}
                  >
                    {transition.difficulty}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground mt-1">Difficulty</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-amber-500" />
          <span><strong>Elite Insight:</strong> Based on your current profile, focusing on {displayTargetRole} could increase your earning potential by 40% over 5 years with strategic upskilling.</span>
        </p>
      </div>
    </Card>
  );
}