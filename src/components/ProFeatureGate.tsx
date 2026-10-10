import { useState, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Lock, Zap, Star, Crown, Sparkles, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

interface ProFeatureGateProps {
  featureName: string;
  featureIcon: ReactNode;
  featureColor?: string; // e.g., "#0A66C2" for LinkedIn blue
  description?: string;
  benefits?: string[];
}

export const ProFeatureGate = ({
  featureName,
  featureIcon,
  featureColor = "hsl(var(--primary))",
  description = "Upgrade to continue improving your resume, LinkedIn, and career strategy.",
  benefits = [
    "Unlimited AI-powered analyses",
    "Detailed recruiter insights",
    "Ready-to-paste optimizations",
    "Priority processing"
  ]
}: ProFeatureGateProps) => {
  const navigate = useNavigate();
  const [isRevealed, setIsRevealed] = useState(false);
  const [lockAnimating, setLockAnimating] = useState(false);
  // UI-SPEC F6 (XD-24): this is EliteFeatureGate's twin — same six concurrent
  // infinite loops against a budget of two. It gets the identical treatment:
  // four become static decorations, and the two that survive (the conic border
  // and the CTA shimmer) are gated so `prefers-reduced-motion: reduce` yields
  // ZERO. These are framer-motion RAF/WAAPI loops, so the global CSS reset in
  // `index.css` structurally cannot reach them — the gate must be in the
  // component, which is why `responsive-source-guard.test.ts` asserts it here.
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    // Trigger the reveal animation on mount
    const timer = setTimeout(() => {
      setIsRevealed(true);
    }, 300);

    // Trigger lock animation
    const lockTimer = setTimeout(() => {
      setLockAnimating(true);
    }, 800);

    return () => {
      clearTimeout(timer);
      clearTimeout(lockTimer);
    };
  }, []);

  return (
    // UI-SPEC F3 (XD-08): the decorative `-right-32 w-96` orb is positioned
    // against the max-w-4xl wrapper and bled 96px past the viewport, which was
    // EXACTLY the documentElement scrollWidth overhang at 7 of 8 tested widths.
    // Clipping at the full-width section keeps the glow bleeding over the card
    // on wide screens while making it impossible to scroll the page.
    <div className="min-h-[80vh] overflow-hidden flex items-center justify-center px-4 py-12">
      <div className="relative w-full max-w-4xl">
        {/* Background gradient orbs */}
        <div 
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[120px] opacity-20 pointer-events-none"
          style={{ backgroundColor: featureColor }}
        />
        <div 
          className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full blur-[120px] opacity-15 pointer-events-none"
          style={{ backgroundColor: featureColor }}
        />

        {/* Main container with split reveal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative overflow-hidden rounded-3xl border-2 border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl"
        >
          {/* Animated gradient border */}
          <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
            <motion.div
              animate={shouldReduceMotion ? {} : {
                rotate: [0, 360],
              }}
              transition={shouldReduceMotion ? { duration: 0 } : {
                duration: 8,
                repeat: Infinity,
                ease: "linear"
              }}
              className="absolute -inset-[200%] opacity-30"
              style={{
                background: `conic-gradient(from 0deg, transparent, ${featureColor}, transparent, transparent)`
              }}
            />
          </div>

          <div className="relative z-10 grid md:grid-cols-2 gap-0">
            {/* Left side - Blurred preview */}
            <motion.div 
              className="relative p-8 md:p-12 overflow-hidden"
              initial={{ x: 0 }}
              animate={{ x: isRevealed ? 0 : 20 }}
            >
              {/* Simulated content preview */}
              <div className="space-y-4 blur-[6px] opacity-40 select-none pointer-events-none">
                <div className="h-8 w-3/4 rounded-lg bg-muted/60" />
                <div className="h-4 w-full rounded bg-muted/40" />
                <div className="h-4 w-5/6 rounded bg-muted/40" />
                <div className="h-24 w-full rounded-xl bg-muted/30 mt-6" />
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="h-16 rounded-lg bg-muted/30" />
                  <div className="h-16 rounded-lg bg-muted/30" />
                  <div className="h-16 rounded-lg bg-muted/30" />
                </div>
                <div className="h-32 w-full rounded-xl bg-muted/20 mt-4" />
              </div>

              {/* Gradient overlay from left */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-card/50 to-card"
              />

              {/* Lock overlay with animation */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, duration: 0.5, type: "spring" }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <motion.div
                  animate={lockAnimating ? {
                    scale: [1, 1.2, 1],
                    rotate: [0, -10, 10, -5, 0],
                  } : {}}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  className="relative"
                >
                  {/* Glow behind lock. F6: static decoration — the infinite
                      scale/opacity loop is removed. */}
                  <div
                    className="absolute inset-0 rounded-full blur-xl opacity-30"
                    style={{ backgroundColor: featureColor, transform: "scale(2)" }}
                  />
                  <div 
                    className="relative w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl"
                    style={{ 
                      background: `linear-gradient(135deg, ${featureColor}, ${featureColor}dd)`,
                    }}
                  >
                    <Lock className="h-10 w-10 text-white" />
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>

            {/* Right side - CTA content */}
            <motion.div 
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="p-8 md:p-12 flex flex-col justify-center bg-gradient-to-br from-transparent to-muted/20"
            >
              {/* Feature icon */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.5, duration: 0.5, type: "spring" }}
                className="mb-6"
              >
                <div 
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ 
                    backgroundColor: `${featureColor}20`,
                  }}
                >
                  <div style={{ color: featureColor }}>
                    {featureIcon}
                  </div>
                </div>
              </motion.div>

              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <Badge className="mb-4 px-4 py-2 text-sm bg-primary text-primary-foreground gap-2 w-fit">
                  <Star className="h-4 w-4" />
                  ELITE EXCLUSIVE
                </Badge>
              </motion.div>

              {/* Title */}
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="text-3xl md:text-4xl font-bold mb-4"
              >
                {featureName}
              </motion.h1>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="text-lg text-muted-foreground mb-6"
              >
                {description}
              </motion.p>

              {/* Benefits list */}
              <motion.ul
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="space-y-3 mb-8"
              >
                {benefits.map((benefit, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1 + index * 0.1 }}
                    className="flex items-center gap-3 text-sm text-muted-foreground"
                  >
                    <CheckCircle 
                      className="h-5 w-5 flex-shrink-0" 
                      style={{ color: featureColor }}
                    />
                    {benefit}
                  </motion.li>
                ))}
              </motion.ul>

              {/* CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3 }}
              >
                <Button 
                  onClick={() => navigate('/profile')}
                  size="lg"
                  className="w-full md:w-auto px-8 py-6 text-lg font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] bg-primary relative overflow-hidden group"
                >
                  {/* Shimmer effect — one of the two surviving infinite loops. */}
                  {!shouldReduceMotion && (
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                      animate={{ x: ["-100%", "100%"] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    />
                  )}
                  <Zap className="mr-2 h-5 w-5 relative z-10" />
                  <span className="relative z-10">Upgrade to Elite</span>
                </Button>
              </motion.div>
            </motion.div>
          </div>

          {/* Bottom sparkle accent */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden"
          >
            {/* F6: static accent bar — the infinite sweep is removed. */}
            <div
              className="h-full w-full"
              style={{
                background: `linear-gradient(90deg, transparent, ${featureColor}, transparent)`
              }}
            />
          </motion.div>
        </motion.div>

        {/* Floating sparkles. F6: static decorations — two infinite
            float/rotate loops removed. */}
        <div className="absolute -top-6 right-12 text-primary/30">
          <Sparkles className="h-8 w-8" />
        </div>
        <div className="absolute -bottom-4 left-16 text-primary/20">
          <Crown className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
};
