import { motion, useReducedMotion } from 'framer-motion';
import { Lock, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BlurredLockCardProps {
  children: React.ReactNode;
  className?: string;
  ctaHref?: string;
  ctaLabel?: string;
  tier?: 'pro' | 'elite';
  minHeight?: string;
}

export const BlurredLockCard = ({
  children,
  className = '',
  ctaHref = '/pricing',
  ctaLabel = 'Upgrade to unlock your full potential',
  tier,
  minHeight,
}: BlurredLockCardProps) => {
  const navigate = useNavigate();
  // UI-SPEC F6 (XD-24): this card is rendered up to THREE times on a single
  // Career Compass screen for a Free user, and each copy previously ran two
  // infinite loops (a CSS shimmer + a framer boxShadow pulse) — six concurrent
  // infinite animations against a budget of two, on exactly the low-memory
  // device XDEV-09 is about. Both loops are removed; the entrance animation is
  // finite and is additionally gated here.
  const shouldReduceMotion = useReducedMotion();

  const handleClick = () => navigate(ctaHref);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(ctaHref);
    }
  };

  const tierLabel = tier ? 'Elite plan required' : null;

  return (
    <div
      className={`relative rounded-xl overflow-hidden ${minHeight ?? ''} ${className}`}
    >
      {/* Blurred children content (skeleton stays visible behind blur) */}
      <div
        className="blur-md opacity-60 pointer-events-none select-none"
        aria-hidden="true"
        data-testid="blurred-lock-card-content"
      >
        {children}
      </div>

      {/* Section-level lock overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-start pt-6 pb-8 px-4 cursor-pointer bg-gradient-to-b from-background/70 via-background/40 to-background/70 backdrop-blur-[2px]"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={ctaLabel}
        data-testid="blurred-lock-card-overlay"
      >
        {/* Top-anchored CTA button with animated coral gradient sheen */}
        <motion.button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
          whileHover={shouldReduceMotion ? undefined : { scale: 1.04 }}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          className="group relative inline-flex min-h-11 touch-manipulation items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-primary-foreground shadow-[0_10px_40px_-10px_hsl(357_100%_55%/0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background overflow-hidden"
          style={{
            // F6: the gradient stays; only the infinite background-position
            // sweep is gone. The CTA reads identically at rest.
            backgroundImage:
              'linear-gradient(110deg, hsl(357 100% 60%) 0%, hsl(357 100% 70%) 35%, hsl(357 100% 60%) 70%, hsl(357 100% 70%) 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <Crown className="h-4 w-4" aria-hidden="true" />
          <span>{ctaLabel}</span>
        </motion.button>

        {/* Centered prominent lock icon with gradient glow */}
        <div className="flex-1 flex items-center justify-center">
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
            className="flex flex-col items-center gap-3"
          >
            <motion.div
              className="h-16 w-16 rounded-full flex items-center justify-center"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, hsl(357 100% 60%), hsl(357 100% 72%))',
                boxShadow:
                  '0 10px 40px -8px hsl(357 100% 55% / 0.55), inset 0 -2px 6px hsl(357 100% 45% / 0.35)',
              }}
            >
              <Lock className="h-7 w-7 text-primary-foreground" strokeWidth={2.4} />
            </motion.div>
            {tierLabel && (
              <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                {tierLabel}
              </span>
            )}
          </motion.div>
        </div>
      </div>

    </div>
  );
};
