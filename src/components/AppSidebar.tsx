import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { isInterviewPrepEnabled } from "@/config/feature-flags";
import {
  LayoutGrid,
  Upload,
  Compass,
  Linkedin,
  GraduationCap,
  Eye,
  PartyPopper,
  History,
  Settings,
  CreditCard,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { professionalGoalQueryOptions } from "@/hooks/useProfessionalGoal";
import {
  dashboardAnalysisHistoryQueryOptions,
  dashboardLinkedInGradesQueryOptions,
  dashboardRecruitingLensScoresQueryOptions,
  dashboardResumesQueryOptions,
  dashboardSavedJobsQueryOptions,
  onboardingGateQueryOptions,
} from "@/lib/dashboard-queries";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

const bottomNavItems: NavItem[] = [
  { label: "Pricing", to: "/pricing", icon: <CreditCard className="w-5 h-5" /> },
  { label: "Settings", to: "/profile", icon: <Settings className="w-5 h-5" /> },
];

export const AppSidebar = () => {
  const [expanded, setExpanded] = useState(false);
  const location = useLocation();
  const queryClient = useQueryClient();
  const { userId } = useAuthUserId();

  /**
   * Warm the /dashboard cache on demonstrated intent (hover or keyboard focus of the
   * Home link) rather than on every protected page mount, which would fire these
   * queries for users who never open the dashboard.
   *
   * This is a pure warm-up: it uses the SAME option factories the dashboard renders
   * from, so it can only ever fill the cache entries that page is about to read. It
   * never changes what renders, and it is fire-and-forget so it cannot block or throw
   * into navigation.
   *
   * The two tier-dependent reads are deliberately left out unless the tier is already
   * known from the merit-balance cache (TopBar mounts it on every protected page).
   * Guessing a tier here would prefetch a DIFFERENT query key than the dashboard reads
   * and turn the warm-up into a second wasted request.
   */
  const prefetchDashboard = useCallback(() => {
    if (!userId) return;
    if (location.pathname === "/dashboard") return;

    void queryClient.prefetchQuery(onboardingGateQueryOptions(userId));
    void queryClient.prefetchInfiniteQuery(dashboardResumesQueryOptions(userId));
    void queryClient.prefetchInfiniteQuery(dashboardSavedJobsQueryOptions(userId));
    void queryClient.prefetchQuery(dashboardRecruitingLensScoresQueryOptions(userId));
    void queryClient.prefetchQuery(professionalGoalQueryOptions(userId));

    const tier = queryClient.getQueryData<{ tier?: string }>(["merit-balance", userId])?.tier;
    if (!tier) return;
    void queryClient.prefetchQuery(dashboardLinkedInGradesQueryOptions(userId, tier));
    void queryClient.prefetchQuery(dashboardAnalysisHistoryQueryOptions(userId, tier));
  }, [location.pathname, queryClient, userId]);

  // Phase 47 — D-01: when the Interview Prep flag is off, the entry stays
  // visible but is disabled and shows a "Coming Soon" tooltip. When the flag
  // is on (staging), the entry behaves exactly as today (D-03).
  const interviewPrepEnabled = isInterviewPrepEnabled();
  const topNavItems = useMemo<NavItem[]>(
    () => [
      { label: "Home", to: "/dashboard", icon: <LayoutGrid className="w-5 h-5" /> },
      { label: "Resume Analysis", to: "/upload", icon: <Upload className="w-5 h-5" /> },
      { label: "Career Compass", to: "/career-compass", icon: <Compass className="w-5 h-5" /> },
      { label: "LinkedIn Grader", to: "/linkedin-grader", icon: <Linkedin className="w-5 h-5" /> },
      // Phase 47 — D-01: disabled + 'Coming Soon' tooltip when flag off.
      {
        label: "Interview Prep",
        to: "/interview-prep",
        icon: <GraduationCap className="w-5 h-5" />,
        disabled: !interviewPrepEnabled,
      },
      { label: "Recruiting Lens", to: "/recruiting-lens", icon: <Eye className="w-5 h-5" /> },
      { label: "Celebrations", to: "/celebrations", icon: <PartyPopper className="w-5 h-5" /> },
      { label: "History", to: "/history", icon: <History className="w-5 h-5" /> },
    ],
    [interviewPrepEnabled],
  );

  const isActive = (path: string) => location.pathname === path;

  const renderNavItem = (item: NavItem, index: number) => {
    const active = isActive(item.to);
    // Only the dashboard entry warms a cache; every other item is untouched.
    const warmOnIntent = item.to === "/dashboard" ? prefetchDashboard : undefined;

    const button = (
      <Link
        to={item.disabled ? "#" : item.to}
        aria-disabled={item.disabled ? true : undefined}
        onMouseEnter={warmOnIntent}
        onFocus={warmOnIntent}
        onClick={(e) => {
          if (item.disabled) e.preventDefault();
          if (expanded) setExpanded(false);
        }}
        className={cn(
          "flex items-center rounded-xl transition-all duration-200",
          expanded ? "h-11 px-3" : "w-11 h-11 justify-center",
          active
            ? "bg-foreground text-background shadow-lg"
            : "text-muted-foreground hover:text-foreground hover:bg-muted",
          item.disabled && "opacity-40 cursor-not-allowed pointer-events-none"
        )}
      >
        <span className="flex-shrink-0">{item.icon}</span>
        <span
          className={cn(
            "text-sm font-medium whitespace-nowrap transition-all duration-200",
            expanded
              ? "opacity-100 ml-3"
              : "opacity-0 w-0 overflow-hidden ml-0"
          )}
          style={{
            transitionDelay: expanded ? `${60 + index * 25}ms` : "0ms",
          }}
        >
          {item.label}
        </span>
      </Link>
    );

    if (expanded) {
      return <div key={item.to + item.label}>{button}</div>;
    }

    return (
      <Tooltip key={item.to + item.label}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">
          {item.disabled ? `${item.label} · Coming Soon` : item.label}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <>
      {/* Backdrop overlay */}
      {expanded && (
        <div
          className="fixed inset-0 z-20 overscroll-none bg-black/20 backdrop-blur-[2px]"
          onClick={() => setExpanded(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          // XDEV-05 / OT-19 — `index.html` opts into `viewport-fit=cover` (plan
          // 03-07), so this viewport-anchored rail now paints INTO the display
          // cutout. Without the inset its 64px toggle row sits under the status bar
          // / dynamic island. `env()` resolves to 0px everywhere else, so this is a
          // no-op on every non-notched device.
          "fixed top-0 left-0 z-30 flex h-viewport w-14 flex-col border-r border-border/40 bg-background pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] sm:w-[72px]"
        )}
        style={{ width: expanded ? 220 : undefined }}
      >
        {/* Toggle button */}
        <div className="flex h-16 flex-shrink-0 items-center justify-center">
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className={cn(
              "flex items-center rounded-xl transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted",
              expanded ? "h-11 px-3" : "w-11 h-11 justify-center"
            )}
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            <span className="relative w-5 h-5 flex-shrink-0">
              <Menu
                className={cn(
                  "w-5 h-5 absolute inset-0 transition-all duration-300",
                  expanded
                    ? "rotate-90 scale-75 opacity-0"
                    : "rotate-0 scale-100 opacity-100"
                )}
              />
              <X
                className={cn(
                  "w-5 h-5 absolute inset-0 transition-all duration-300",
                  expanded
                    ? "rotate-0 scale-100 opacity-100"
                    : "rotate-90 scale-75 opacity-0"
                )}
              />
            </span>
            <span
              className={cn(
                "text-sm font-medium whitespace-nowrap transition-all duration-200",
                expanded
                  ? "opacity-100 ml-3"
                  : "opacity-0 w-0 overflow-hidden ml-0"
              )}
            >
              Menu
            </span>
          </button>
        </div>

        {/* Top nav items */}
        <TooltipProvider delayDuration={0}>
          {/* UI-SPEC F4 (XD-12): the 44x44 rail links themselves are compliant;
              only the SEPARATION failed at 4px. gap-2 is the 8px contract floor. */}
          <nav className="flex min-h-0 flex-1 overscroll-contain flex-col gap-2.5 overflow-y-auto px-1.5 sm:px-3">
            {topNavItems.map((item, index) => renderNavItem(item, index))}
          </nav>

          {/* Bottom section */}
          <div className="flex flex-col gap-2.5 border-t border-border/60 px-1.5 py-2 sm:px-3 sm:py-3">
            {bottomNavItems.map((item, index) =>
              renderNavItem(item, topNavItems.length + index)
            )}
          </div>
        </TooltipProvider>
      </aside>
    </>
  );
};
