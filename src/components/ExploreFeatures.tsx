import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, Grid2X2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { isInterviewPrepEnabled } from "@/config/feature-flags";
import { ComingSoonBadge } from "@/components/ComingSoonBadge";
import { cn } from "@/lib/utils";

type Feature = {
  label: string;
  path: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  disabled?: boolean;
};

const ExploreFeatures = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const navigate = useNavigate();

  // Phase 47 — D-01: gate the Interview Prep tile behind the feature flag.
  // When the flag is off, the tile stays visible but is disabled, renders
  // a <ComingSoonBadge />, and clicks are no-ops. When the flag is on
  // (staging), the tile behaves exactly as today (D-03).
  const interviewPrepEnabled = isInterviewPrepEnabled();
  const FEATURES = useMemo<Feature[]>(
    () => [
      {
        label: "Resume Analysis",
        path: "/upload",
        icon: <Upload className="w-4 h-4" />,
        iconBg: "bg-primary/15",
        iconColor: "text-primary",
      },
      {
        label: "Career Compass",
        path: "/career-compass",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        ),
        iconBg: "bg-purple-500/15",
        iconColor: "text-purple-400",
      },
      {
        label: "Recruiting Lens",
        path: "/recruiting-lens",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        ),
        iconBg: "bg-orange-500/15",
        iconColor: "text-orange-400",
      },
      {
        label: "LinkedIn Grader",
        path: "/linkedin-grader",
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
        ),
        iconBg: "bg-sky-500/15",
        iconColor: "text-sky-400",
      },
      // Phase 47 — D-01: disabled + <ComingSoonBadge /> when flag off.
      {
        label: "Interview Prep",
        path: "/interview-prep",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        ),
        iconBg: "bg-indigo-500/15",
        iconColor: "text-indigo-400",
        disabled: !interviewPrepEnabled,
      },
    ],
    [interviewPrepEnabled],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setSessionResolved(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setSessionResolved(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleFeatureClick = (feature: Feature) => {
    if (feature.disabled) return;
    setIsOpen(false);
    if (user) {
      navigate(feature.path);
    } else {
      navigate("/auth");
    }
  };

  // Centralized visibility gate: while the session is still resolving, render
  // nothing (prevents a flash of the button for users who turn out to be
  // authenticated); once resolved, show the floating button ONLY for confirmed
  // signed-out visitors. The sidebar/navbar already provides navigation for
  // authenticated users, so the button would be a duplicate for them.
  if (!sessionResolved || user) return null;

  return (
    <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] right-3 z-50 sm:bottom-6 sm:right-6">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <motion.button
            // UI-SPEC F4 (XD-11): a `scale` entrance shrinks the measured hit
            // box for the whole spring, so on a slow device the FAB is under
            // 44x44 exactly when it is most likely to be tapped. The same
            // entrance is expressed as `y` + opacity, which never changes the
            // element's size.
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="relative flex min-h-11 min-w-11 touch-manipulation items-center justify-center group"
            aria-label="Explore Features"
          >
            {/* Gradient glow ring */}
            <span className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary via-accent to-secondary opacity-20 blur-md group-hover:opacity-50 transition-opacity duration-500" />

            {/* Button body */}
            <span className="relative flex h-11 w-11 items-center justify-center gap-2 overflow-hidden rounded-full border border-primary/20 bg-background px-0 shadow-lg transition-all duration-300 group-hover:border-primary/40 sm:w-auto sm:px-5">
              {/* Inner gradient sweep on hover */}
              <span className="absolute inset-0 bg-gradient-to-r from-primary/5 via-accent/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <Grid2X2 className="relative w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
              <span className="relative hidden text-sm font-medium text-foreground sm:inline">Explore</span>
            </span>
          </motion.button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          sideOffset={12}
          className="w-64 p-2"
        >
          <div className="flex flex-col gap-0.5">
            {FEATURES.map((f) => (
              <button
                key={f.path}
                onClick={() => handleFeatureClick(f)}
                disabled={f.disabled}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors duration-150 text-left",
                  f.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground",
                )}
              >
                <div className={`w-7 h-7 rounded-md ${f.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <div className={f.iconColor}>{f.icon}</div>
                </div>
                <span className="flex-1">{f.label}</span>
                {f.disabled && <ComingSoonBadge />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default ExploreFeatures;
