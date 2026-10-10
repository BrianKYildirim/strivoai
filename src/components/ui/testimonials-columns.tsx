import { motion, useReducedMotion } from "framer-motion";
import { Star } from "lucide-react";

interface Testimonial {
  text: string;
  image: string;
  name: string;
  role: string;
}

interface TestimonialsColumnProps {
  testimonials: Testimonial[];
  duration?: number;
  className?: string;
}

export const TestimonialsColumn = ({
  testimonials,
  duration = 10,
  className = "",
}: TestimonialsColumnProps) => {
  // Duplicate for seamless loop
  const doubled = [...testimonials, ...testimonials];
  // UI-SPEC F6 (XD-24): the marquee is a framer-motion RAF/WAAPI loop, so the
  // global `prefers-reduced-motion` reset in `index.css` — which only reaches
  // CSS animations — structurally cannot stop it. Under `reduce` the column
  // renders as a plain static list; the testimonials stay readable, only the
  // perpetual scroll stops. This is the exact half `document.getAnimations()`
  // cannot observe, which is why the source guard asserts the gate.
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{
        maskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
      }}
    >
      <motion.div
        animate={shouldReduceMotion ? {} : { translateY: "-50%" }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration, repeat: Infinity, ease: "linear" }}
      >
        {doubled.map((t, i) => (
          <div
            key={`${t.name}-${i}`}
            className="rounded-2xl border border-border/30 bg-secondary/20 p-5 mb-4"
          >
            <div className="flex gap-1 mb-3">
              {[...Array(5)].map((_, j) => (
                <Star key={j} className="w-3.5 h-3.5 fill-primary text-primary" />
              ))}
            </div>
            <p className="text-sm text-foreground mb-4 leading-relaxed">"{t.text}"</p>
            <div className="flex items-center gap-3">
              <img
                src={t.image}
                alt={t.name}
                className="h-9 w-9 rounded-full object-cover flex-shrink-0"
              />
              <div>
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
};
