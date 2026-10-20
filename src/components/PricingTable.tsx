import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Gem, Loader2, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useStripeCheckout } from '@/hooks/useStripeCheckout';
import { StripeCheckoutWrapper } from '@/components/StripeCheckoutWrapper';
import { toast } from 'sonner';
import { useTierAccess } from '@/hooks/useTierAccess';
import { ComingSoonBadge } from '@/components/ComingSoonBadge';
import { isInterviewPrepEnabled } from '@/config/feature-flags';

// ── Plan configuration ──────────────────────────────────────────

interface PlanConfig {
  name: string;
  tier: 'free' | 'elite';
  monthlyPrice: number;
  yearlyPrice: number;
  yearlySavings: number;
  meritAllowance: string;
  highlighted: boolean;
  features: string[];
  excludedFeatures: string[];
}

const PLANS: PlanConfig[] = [
  {
    name: 'Free',
    tier: 'free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlySavings: 0,
    meritAllowance: '10 Merits/month',
    highlighted: false,
    features: [
      'Resume Analysis (3 Merits)',
      'Career Compass (3 Merits)',
      'LinkedIn Grader (3 Merits)',
      'Basic results with locked premium sections',
    ],
    excludedFeatures: [
      'Interview Prep',
      'Recruiting Lens',
      'Full analysis results',
      'Priority support',
    ],
  },
  {
    name: 'Elite',
    tier: 'elite',
    monthlyPrice: 16.99,
    yearlyPrice: 169.99,
    yearlySavings: 33.89,
    meritAllowance: '150 Merits/month',
    highlighted: true,
    features: [
      'Everything in Free',
      '150 Merits every month',
      'Full analysis + richest insights',
      'Interactive interview quiz (5 Merits)',
      'Full Recruiting Lens (5 Merits)',
      'Streak tracking',
      'Priority support',
    ],
    excludedFeatures: [],
  },
];

// ── PricingTable component ──────────────────────────────────────

const PricingTable = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutTitle, setCheckoutTitle] = useState('');
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const { isLoading: isCheckoutLoading, fetchClientSecret } = useStripeCheckout();
  const { tier: currentTier, loading: tierLoading } = useTierAccess();
  // Phase 47 — D-01/D-04: decorate Interview Prep bullets with <ComingSoonBadge />
  // when the production flag is off. pricing-config.ts is intentionally untouched
  // (D-04) — the UI does the conditional render, not the config layer.
  const interviewPrepEnabled = isInterviewPrepEnabled();

  const handleCheckoutOpenChange = (next: boolean) => {
    setCheckoutOpen(next);
    if (!next) {
      setCheckoutSecret(null);
      setLoadingTier(null);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (u) {
        setUser({ id: u.id, email: u.email || '' });
      }
    });
  }, []);

  const handleSubscribe = async (plan: PlanConfig) => {
    if (plan.tier === 'free') {
      if (!user) {
        navigate('/auth');
      }
      return;
    }

    if (!user) {
      toast.info('Please sign in first to upgrade');
      navigate('/auth');
      return;
    }

    // UI-SPEC G1 / checkout-source-guard: open on THIS tick (StripeCheckoutWrapper shows "Preparing
    // secure checkout…" while the secret is null) so the create-checkout-session
    // round trip is not dead time. Re-click is already blocked by isCtaDisabled
    // via loadingTier / isCheckoutLoading.
    setLoadingTier(plan.tier);
    setCheckoutSecret(null);
    setCheckoutTitle(`Subscribe to ${plan.name}`);
    setCheckoutOpen(true);

    const secret = await fetchClientSecret({
      mode: 'subscription',
      tier: plan.tier,
      interval: interval === 'yearly' ? 'annual' : 'monthly',
    });

    if (secret) {
      setCheckoutSecret(secret);
    } else {
      // The hook already toasted — just don't leave the dialog stuck preparing.
      setCheckoutOpen(false);
    }
    setLoadingTier(null);
  };

  const isCurrent = (planTier: string): boolean => {
    if (tierLoading) return false;
    return currentTier === planTier;
  };

  const getCtaLabel = (plan: PlanConfig): string => {
    if (isCurrent(plan.tier)) return 'Current Plan';
    if (plan.tier === 'free' && !user) return 'Sign Up Free';
    if (plan.tier === 'elite') return 'Get Elite';
    return 'Current Plan';
  };

  const isCtaDisabled = (plan: PlanConfig): boolean => {
    if (isCurrent(plan.tier)) return true;
    if (plan.tier === 'free' && user) return true;
    if (loadingTier === plan.tier || isCheckoutLoading) return true;
    return false;
  };

  const formatPrice = (price: number): string => {
    if (price === 0) return '$0';
    return `$${price.toFixed(2)}`;
  };

  const getMonthlyEquivalent = (plan: PlanConfig): string => {
    if (plan.yearlyPrice === 0) return '$0';
    const monthly = plan.yearlyPrice / 12;
    return `$${monthly.toFixed(2)}`;
  };

  return (
    <section className="py-16 px-4 relative">
      <div className="container mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="text-center mb-8 space-y-4">
          <h2 className="text-2xl md:text-4xl font-semibold text-foreground">
            Choose Your Plan
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            Merits power every AI analysis. Pick the plan that fits your job search pace.
          </p>
        </div>

        {/* Billing Interval Toggle */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-1 p-1 bg-secondary/50 rounded-full border border-border">
            <button
              onClick={() => setInterval('monthly')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                interval === 'monthly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval('yearly')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                interval === 'yearly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Yearly
              <span className="text-xs bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                Save up to 29%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {PLANS.map((plan) => {
            const current = isCurrent(plan.tier);
            const isHighlighted = plan.highlighted && plan.tier === 'elite';

            return (
              <Card
                key={plan.tier}
                className={`relative p-6 flex flex-col border-2 transition-all duration-300 hover:shadow-lg hover:border-primary/30 ${
                  current
                    ? 'border-primary shadow-xl'
                    : isHighlighted
                    ? 'border-primary shadow-xl shadow-primary/20'
                    : 'border-border'
                }`}
              >
                {/* Most Popular Badge */}
                {isHighlighted && !current && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <Badge className="bg-emerald-500 text-white hover:bg-emerald-500 px-3 py-1 text-xs font-semibold">
                      Most Popular
                    </Badge>
                  </div>
                )}

                {/* Current Plan Badge */}
                {current && (
                  <div className="absolute -top-3 right-4 z-10">
                    <Badge variant="default" className="px-3 py-1 text-xs font-semibold">
                      Current Plan
                    </Badge>
                  </div>
                )}

                {/* Plan Name */}
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  {plan.name}
                </h3>

                {/* Price Display */}
                <div className="mb-4">
                  {plan.tier === 'free' ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-semibold text-foreground">$0</span>
                      <span className="text-sm text-muted-foreground">/forever</span>
                    </div>
                  ) : interval === 'monthly' ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-semibold text-foreground">
                        {formatPrice(plan.monthlyPrice)}
                      </span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm text-muted-foreground line-through">
                          {formatPrice(plan.monthlyPrice)}/mo
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-semibold text-foreground">
                          {getMonthlyEquivalent(plan)}
                        </span>
                        <span className="text-sm text-muted-foreground">/mo</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {formatPrice(plan.yearlyPrice)}/yr
                        </span>
                        <span
                          className="text-xs font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 rounded-full px-2 py-1"
                          aria-label={`Save $${plan.yearlySavings.toFixed(2)} with yearly billing`}
                        >
                          Save ${plan.yearlySavings.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Merit Allowance */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-secondary/50 rounded-full mb-4">
                  <Gem className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    {plan.meritAllowance}
                  </span>
                </div>

                {/* Feature List */}
                <div className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map((feature, i) => {
                    // Phase 47 — D-01/D-04: match either "Interview Prep" or
                    // "interview quiz" so paid interview bullets pick up the badge.
                    const mentionsIP = /interview (prep|quiz)/i.test(feature);
                    const showBadge = mentionsIP && !interviewPrepEnabled;
                    return (
                      <div key={i} className="flex items-start gap-2.5 flex-wrap">
                        <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">{feature}</span>
                        {showBadge && <ComingSoonBadge />}
                      </div>
                    );
                  })}
                  {plan.excludedFeatures.map((feature, i) => {
                    const mentionsIP = /interview (prep|quiz)/i.test(feature);
                    const showBadge = mentionsIP && !interviewPrepEnabled;
                    return (
                      <div key={`x-${i}`} className="flex items-start gap-2.5 flex-wrap">
                        <X className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-muted-foreground line-through">
                          {feature}
                        </span>
                        {showBadge && <ComingSoonBadge />}
                      </div>
                    );
                  })}
                </div>

                {/* CTA Button */}
                <Button
                  onClick={() => handleSubscribe(plan)}
                  disabled={isCtaDisabled(plan)}
                  variant={isCurrent(plan.tier) || plan.tier === 'free' ? 'outline' : 'default'}
                  className="w-full py-5 text-base font-semibold mt-auto"
                >
                  {loadingTier === plan.tier && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {getCtaLabel(plan)}
                </Button>
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 space-y-2">
          <p className="text-sm text-muted-foreground">
            All paid plans include 14-day money-back guarantee. Cancel anytime.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Prices in USD. Secure checkout powered by Stripe.
          </p>
        </div>
      </div>

      {/* Stripe Checkout Dialog */}
      <StripeCheckoutWrapper
        open={checkoutOpen}
        onOpenChange={handleCheckoutOpenChange}
        clientSecret={checkoutSecret}
        title={checkoutTitle}
      />
    </section>
  );
};

export default PricingTable;
