import {
  FileText,
  Target,
  Sparkles,
  Briefcase,
  TrendingUp,
  Linkedin,
  Gauge,
  Upload,
  Cpu,
  CheckCircle,
  ArrowRight,
  Star,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { motion, useReducedMotion } from "framer-motion";
import { GlobeLive } from "@/components/ui/cobe-globe-live";
import { TestimonialsColumn } from "@/components/ui/testimonials-columns";
import { useIsMobile } from "@/hooks/use-mobile";

// Scroll animated section wrapper
const AnimatedSection = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
  const { ref, isVisible } = useScrollAnimation(0.1);
  return (
    <section
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(24px)",
        transition: "opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {children}
    </section>
  );
};

// Pulsing icon wrapper for visual interest.
// UI-SPEC F6 (XD-24): the pulse is an infinite framer-motion loop, so it MUST be
// gated on useReducedMotion() — getAnimations() cannot observe framer-motion loops,
// which is why src/test/platform/responsive-source-guard.test.ts is the only proof.
const PulsingIcon = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div
      animate={shouldReduceMotion ? undefined : { scale: [1, 1.08, 1] }}
      transition={
        shouldReduceMotion
          ? undefined
          : { duration: 2.5, repeat: Infinity, delay, ease: "easeInOut" }
      }
    >
      {children}
    </motion.div>
  );
};

// Section heading component
const SectionHeading = ({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
}) => (
  <div className="text-center mb-12">
    {badge && <div className="flex justify-center mb-4">{badge}</div>}
    <h3 className="text-xl sm:text-2xl md:text-[2rem] font-bold tracking-tight text-foreground mb-3">{title}</h3>
    {subtitle && <p className="text-sm md:text-[0.95rem] text-muted-foreground max-w-lg mx-auto">{subtitle}</p>}
  </div>
);

const BelowFold = () => {
  // F6 motion budget — see the testimonial column block below.
  const isMobile = useIsMobile();
  const features = [
    {
      icon: FileText,
      name: "Resume Analysis",
      description: "Beat ATS filters with recruiter-grade feedback and ready-to-paste edits that strengthen every section of your resume.",
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: Sparkles,
      name: "Career Compass",
      description: "Using your resume, discover personalized career paths, best-fit roles, and high-paying opportunities aligned with your strengths.",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      icon: Briefcase,
      name: "Recruiting Lens",
      description: "Upload any job description for a match score, honest recruiter verdict, key gaps, and targeted improvements.",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      icon: Linkedin,
      name: "LinkedIn Grader",
      description: "Strengthen every LinkedIn section with recruiter-focused scoring, visibility insights, and ready-to-paste profile edits.",
      color: "text-sky-500",
      bg: "bg-sky-500/10",
    },
    {
      icon: Target,
      name: "Role Targeting",
      description: "Tailor your resume and LinkedIn to any role with sharper positioning, relevant keywords, and application-ready edits.",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      icon: Gauge,
      name: "Goal Readiness",
      description: "Strive toward your professional career goal and see exactly what you need to improve next.",
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
  ];

  const steps = [
    {
      num: "1",
      icon: Upload,
      title: "Upload your resume",
      subtitle: "PDF, takes 5 seconds",
      color: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/30",
    },
    {
      num: "2",
      icon: Cpu,
      title: "AI analyzes your profile",
      subtitle: "ATS scan + Recruiter signals + Keyword check",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
    },
    {
      num: "3",
      icon: CheckCircle,
      title: "Get exact fixes",
      subtitle: "Readiness score + Actionable edits",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
    },
  ];

  const stats = [
    { value: "50K+", label: "Resumes analyzed" },
    { value: "120+", label: "Countries" },
    { value: "95%", label: "Satisfaction" },
  ];

  // 9 testimonials split across 3 columns
  const testimonials = [
    // Column 1
    {
      text: "Got 3x more callbacks after using Strivo. The ATS optimization actually works.",
      image: "https://randomuser.me/api/portraits/men/32.jpg",
      name: "Marcus T.",
      role: "Software Engineer at FAANG",
    },
    {
      text: "Simple, fast, effective. Wish I found this months ago.",
      image: "https://randomuser.me/api/portraits/women/44.jpg",
      name: "Priya S.",
      role: "Product Manager, Startup",
    },
    {
      text: "The LinkedIn grader helped me land my dream job. Recruiters started reaching out within a week.",
      image: "https://randomuser.me/api/portraits/women/68.jpg",
      name: "Chloe R.",
      role: "Marketing Lead, Fortune 500",
    },
    // Column 2
    {
      text: "Finally, a tool that actually understands what recruiters are looking for.",
      image: "https://randomuser.me/api/portraits/men/75.jpg",
      name: "David K.",
      role: "Data Scientist, Tech Unicorn",
    },
    {
      text: "The skills gap analysis showed me exactly what I needed to learn. Got promoted 3 months later.",
      image: "https://randomuser.me/api/portraits/women/12.jpg",
      name: "Sofia L.",
      role: "UX Designer, Agency",
    },
    {
      text: "Used Strivo for my career pivot. The job matching feature is incredibly accurate.",
      image: "https://randomuser.me/api/portraits/men/41.jpg",
      name: "James W.",
      role: "Now at Google (ex-Teacher)",
    },
    // Column 3
    {
      text: "My ATS score went from 54 to 91 in one session. I had 4 interviews the following week.",
      image: "https://randomuser.me/api/portraits/women/55.jpg",
      name: "Aisha M.",
      role: "Operations Manager",
    },
    {
      text: "Honest feedback without sugarcoating. That's what I needed to actually improve.",
      image: "https://randomuser.me/api/portraits/men/22.jpg",
      name: "Liam O.",
      role: "Finance Analyst",
    },
    {
      text: "Strivo helped me understand exactly what senior roles were looking for. Landed one in 6 weeks.",
      image: "https://randomuser.me/api/portraits/women/31.jpg",
      name: "Yuna C.",
      role: "Senior PM, Scale-up",
    },
  ];

  return (
    <div className="relative bg-background">
      {/* 1. How It Works */}
      <AnimatedSection className="py-14 md:py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <SectionHeading
            title="3 steps. 60 seconds. More interviews."
            subtitle="Create an account to start your analysis"
          />

          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-0">
            {steps.map((step, i) => (
              <div key={step.num} className="flex items-center gap-0">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15, duration: 0.5 }}
                  className="flex items-center gap-4 md:flex-col md:text-center"
                >
                  <PulsingIcon delay={i * 0.8}>
                    <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl ${step.bg} border ${step.border} flex items-center justify-center`}>
                      <step.icon className={`w-6 h-6 md:w-7 md:h-7 ${step.color}`} />
                    </div>
                  </PulsingIcon>
                  <div className="md:mt-4">
                    <h4 className="font-semibold text-foreground">{step.title}</h4>
                    <p className="text-sm text-muted-foreground max-w-[200px]">{step.subtitle}</p>
                  </div>
                </motion.div>

                {/* Arrow connector */}
                {i < steps.length - 1 && (
                  <div className="hidden md:flex items-center mx-6">
                    <div className="w-12 h-px bg-gradient-to-r from-muted-foreground/30 to-muted-foreground/10" />
                    <ArrowRight className="w-4 h-4 text-muted-foreground/40 -ml-1" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* 2. What You Get */}
      <AnimatedSection className="py-16 md:py-24 px-4 border-t border-border/40">
        <div className="container mx-auto max-w-5xl">
          <SectionHeading
            title="What you get"
            subtitle="AI-powered tools to accelerate your career"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr gap-3 md:gap-5">
            {features.map((feature, i) => (
              <motion.div
                key={feature.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                className="h-full flex flex-col p-4 md:p-6 rounded-xl md:rounded-2xl bg-secondary/20 border border-border/30 hover:scale-[1.02] transition-all duration-300"
              >
                <PulsingIcon delay={i * 0.4}>
                  <div className={`w-9 h-9 md:w-10 md:h-10 rounded-lg md:rounded-xl ${feature.bg} flex items-center justify-center mb-3 md:mb-4`}>
                    <feature.icon className={`w-4 h-4 md:w-5 md:h-5 ${feature.color}`} />
                  </div>
                </PulsingIcon>
                <h4 className="text-foreground font-medium text-sm md:text-base mb-1 md:mb-2">{feature.name}</h4>
                <p className="flex-1 text-xs md:text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* 3. Global Reach */}
      <AnimatedSection className="py-16 md:py-24 px-4 border-t border-border/40 overflow-hidden">
        <div className="container mx-auto max-w-4xl">
          <SectionHeading
            title="Used by professionals worldwide"
            subtitle="Career intelligence trusted across industries and geographies"
          />

          <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
            {/* Globe */}
            <div className="w-full md:w-1/2 relative">
              {/* Ambient glow */}
              <div className="absolute inset-0 bg-primary/5 blur-[80px] md:blur-[100px] rounded-full" />
              <div className="max-w-[280px] md:max-w-md mx-auto relative">
                <GlobeLive speed={0.002} />
              </div>
            </div>

            {/* Stats */}
            <div className="w-full md:w-1/2 flex flex-row md:flex-col justify-center gap-6 md:gap-8">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center md:text-left">
                  <p className="text-3xl md:text-4xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* 4. Testimonials */}
      <AnimatedSection className="py-16 md:py-24 px-4 border-t border-border/40">
        <div className="container mx-auto max-w-5xl">
          <SectionHeading
            title="What our users say"
            subtitle="See what our users have to say about their experience with Strivo."
            badge={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Star className="w-3 h-3 fill-primary text-primary" />
                TESTIMONIALS
              </span>
            }
          />

          {/*
            UI-SPEC F6 (XD-24): `hidden lg:block` is `display: none` — it hides
            the column but does NOT stop it. framer-motion keeps driving the RAF
            loop on an unmounted-looking, invisible element, so a 390 px phone
            was paying for THREE marquees to render ONE. Not mounting the two
            decorative columns below `md` is the only thing that actually stops
            the work, and it takes the constrained device XDEV-09 is about from
            three concurrent infinite animations to one.
          */}
          <div className="flex gap-4 max-h-[400px] md:max-h-[560px] overflow-hidden">
            {/* Column 1 — decorative, desktop only */}
            {!isMobile && (
              <TestimonialsColumn
                testimonials={testimonials.slice(0, 3)}
                duration={15}
                className="hidden lg:block flex-1"
              />
            )}
            {/* Column 2 — always visible */}
            <TestimonialsColumn
              testimonials={testimonials.slice(3, 6)}
              duration={19}
              className="flex-1"
            />
            {/* Column 3 — decorative, desktop only */}
            {!isMobile && (
              <TestimonialsColumn
                testimonials={testimonials.slice(6, 9)}
                duration={17}
                className="hidden md:block flex-1"
              />
            )}
          </div>
        </div>
      </AnimatedSection>

      {/* FAQ Link */}
      <AnimatedSection className="py-10 md:py-12 px-4 border-t border-border/40">
        <div className="container mx-auto text-center">
          <p className="text-muted-foreground mb-4">Have questions?</p>
          <Link
            to="/questions"
            className="inline-flex items-center gap-2 text-foreground font-medium hover:text-primary transition-colors duration-200"
          >
            See our FAQ
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </AnimatedSection>

      {/* Footer */}
      <footer className="py-8 md:py-10 px-4 border-t border-border/40">
        <div className="container mx-auto max-w-4xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">© 2025 Strivo. All rights reserved.</p>
            <div className="flex flex-wrap gap-4 md:gap-6 text-xs text-muted-foreground justify-center">
              <Link to="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link to="/refund" className="hover:text-foreground transition-colors">
                Refund
              </Link>
              <a href="mailto:support@strivoai.net" className="hover:text-foreground transition-colors">
                Contact
              </a>
              <Link to="/questions" className="hover:text-foreground transition-colors">
                Questions
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default BelowFold;
