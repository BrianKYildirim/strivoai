import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Upload, User, CreditCard, LogOut, ArrowRight, Shield, Crown, AlertCircle, Gem, Zap } from "lucide-react";
import { useThemeLogo } from "@/hooks/useThemeLogo";
import { supabase } from "@/lib/supabaseClient";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";
import { useMerits } from '@/hooks/useMerits';
import { useAdminTierTest } from "@/contexts/AdminTierTestContext";
import { useAnalysisLock } from "@/contexts/AnalysisLockContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isInterviewPrepEnabled } from "@/config/feature-flags";
import { ComingSoonBadge } from "@/components/ComingSoonBadge";
import { getTierDisplayName } from "@/config/pricing-config";

// ── Animated 3-bar hamburger that morphs into X ───────────────────────────────
const HamburgerIcon = ({ open }: { open: boolean }) => (
  <div className="flex flex-col justify-center items-center w-5 h-5 gap-[5px]" aria-hidden>
    <span
      className={`block h-0.5 rounded-full bg-current transition-all duration-300 ease-in-out origin-center ${
        open ? "w-5 rotate-45 translate-y-[7px]" : "w-5"
      }`}
    />
    <span
      className={`block h-0.5 rounded-full bg-current transition-all duration-300 ease-in-out ${
        open ? "w-0 opacity-0 scale-x-0" : "w-4 opacity-100 scale-x-100"
      }`}
    />
    <span
      className={`block h-0.5 rounded-full bg-current transition-all duration-300 ease-in-out origin-center ${
        open ? "w-5 -rotate-45 -translate-y-[7px]" : "w-5"
      }`}
    />
  </div>
);

export const Navbar = () => {
  const strivoLogo = useThemeLogo();
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<{
    full_name?: string;
    subscription_tier?: string;
  } | null>(null);
  const [credits, setCredits] = useState<{
    used: number;
    limit: number;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const { isZero } = useMerits();
  const { isAdmin, testTier, setTestTier } = useAdminTierTest();
  const { isLocked } = useAnalysisLock();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (!user) {
        setProfile(null);
        setCredits(null);
        return;
      }
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, subscription_tier")
        .eq("id", user.id)
        .single();
      if (!cancelled && profileData) setProfile(profileData);

      const { data: usage } = await supabase.rpc("can_perform_ai_action", {
        p_user_id: user.id,
      });
      if (
        !cancelled &&
        usage &&
        typeof usage === "object" &&
        !Array.isArray(usage)
      ) {
        const u = usage as { current_usage?: number; limit?: number };
        setCredits({ used: u.current_usage || 0, limit: u.limit || 5 });
      }
    };
    refresh();
    window.addEventListener("strivo:profile-updated", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("strivo:profile-updated", refresh);
    };
  }, [user]);

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const isActive = (path: string) => location.pathname === path;

  const publicLinks = useMemo(
    () => [
      { to: "/", label: "Home" },
      { to: "/how-it-works", label: "How it works" },
      { to: "/pricing", label: "Pricing" },
      { to: "/celebrations", label: "Celebrations" },
      { to: "/questions", label: "Questions" },
    ],
    []
  );

  // Phase 47 — D-01: when the Interview Prep flag is off, the entry stays
  // visible but is disabled with a "Coming Soon" affordance (tooltip on
  // desktop, inline badge on mobile drawer). When the flag is on (staging),
  // the entry behaves exactly as today (D-03).
  const interviewPrepEnabled = isInterviewPrepEnabled();
  const authedPrimaryLinks = useMemo(
    () => [
      { to: "/dashboard", label: "Dashboard" },
      { to: "/upload", label: "Resume Analysis" },
      { to: "/career-compass", label: "Career Compass" },
      { to: "/linkedin-grader", label: "LinkedIn Grader" },
      { to: "/recruiting-lens", label: "Recruiting Lens" },
      { to: "/interview-prep", label: "Interview Prep", disabled: !interviewPrepEnabled },
      { to: "/pricing", label: "Pricing" },
    ],
    [interviewPrepEnabled]
  );

  // Icon + color palette per route
  const mobileNavMeta: Record<
    string,
    { icon: React.ReactNode; iconBg: string; iconColor: string }
  > = {
    "/": {
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
    "/how-it-works": {
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
    "/pricing": {
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      iconBg: "bg-amber-500/15",
      iconColor: "text-amber-400",
    },
    "/questions": {
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.065 2.386-1.962 3.772-1.962 1.922 0 3.48 1.357 3.48 3.03 0 1.672-1.558 3.03-3.48 3.03-.812 0-1.49-.258-1.49-.258M12 17h.01" />
        </svg>
      ),
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
    "/dashboard": {
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
    "/upload": {
      icon: (<Upload className="w-4 h-4" />),
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
    "/recruiting-lens": {
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      iconBg: "bg-orange-500/15",
      iconColor: "text-orange-400",
    },
    "/career-compass": {
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      ),
      iconBg: "bg-purple-500/15",
      iconColor: "text-purple-400",
    },
    "/linkedin-grader": {
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      ),
      iconBg: "bg-sky-500/15",
      iconColor: "text-sky-400",
    },
    "/interview-prep": {
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
      iconBg: "bg-indigo-500/15",
      iconColor: "text-indigo-400",
    },
  };

  const getUserInitials = () => {
    if (profile?.full_name) {
      return profile.full_name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return user?.email?.charAt(0).toUpperCase() || "U";
  };

  const getTierLabel = () => {
    return getTierDisplayName(profile?.subscription_tier);
  };

  const activeLinks = user ? authedPrimaryLinks : publicLinks;

  return (
    <>
      <nav
        className={cn(
          "fixed z-50 w-full transition-all duration-500",
          "px-2 sm:px-4 lg:px-6",
          isScrolled ? "py-2 top-2" : "py-3 top-0"
        )}
      >
        <div
          className={cn(
            "mx-auto max-w-6xl transition-all duration-500",
            isScrolled
              ? "rounded-2xl border border-border/40 bg-background/50 backdrop-blur-2xl shadow-lg shadow-primary/5 px-2 py-2.5 sm:px-5"
              : "bg-transparent px-0 py-1 sm:px-2"
          )}
        >
          {/* Top bar -- two groups */}
          <div className="flex h-16 items-center justify-between gap-2 sm:gap-3">

            {/* LEFT GROUP: Hamburger (mobile) | Logo | Desktop NavigationMenu */}
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {/* Mobile Popover Hamburger */}
              <Popover open={menuOpen && !isLocked} onOpenChange={(o) => !isLocked && setMenuOpen(o)}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      // UI-SPEC F4 (XD-11): 36x36 -> 44x44 hit area. The icon is unchanged.
                      "lg:hidden inline-flex min-h-11 min-w-11 items-center justify-center touch-manipulation p-2 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40",
                      isLocked && "opacity-60 pointer-events-none"
                    )}
                    aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
                    aria-expanded={menuOpen}
                    disabled={isLocked}
                  >
                    <HamburgerIcon open={menuOpen} />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={12}
                  className="w-64 p-2"
                >
                  {/* Nav links */}
                  <div className={cn("flex flex-col gap-0.5", isLocked && "pointer-events-none opacity-60")}>
                    {activeLinks.map((l) => {
                      // Phase 47 — D-01: disabled + inline 'Coming Soon' badge when flag off.
                      const linkDisabled = "disabled" in l && (l as { disabled?: boolean }).disabled === true;
                      return (
                        <Link
                          key={l.to}
                          to={linkDisabled ? "#" : l.to}
                          aria-disabled={linkDisabled ? true : undefined}
                          onClick={(e) => {
                            if (isLocked || linkDisabled) {
                              e.preventDefault();
                              return;
                            }
                            setMenuOpen(false);
                          }}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150",
                            isActive(l.to)
                              ? "text-primary"
                              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                            linkDisabled && "opacity-50 cursor-not-allowed pointer-events-none hover:bg-transparent hover:text-muted-foreground"
                          )}
                        >
                          {mobileNavMeta[l.to] && (
                            <div className={`w-7 h-7 rounded-md ${mobileNavMeta[l.to].iconBg} flex items-center justify-center flex-shrink-0`}>
                              <div className={mobileNavMeta[l.to].iconColor}>{mobileNavMeta[l.to].icon}</div>
                            </div>
                          )}
                          <span className="flex-1">{l.label}</span>
                          {linkDisabled && <ComingSoonBadge />}
                        </Link>
                      );
                    })}
                  </div>

                  {/* Profile/Billing/Sign Out live in the avatar dropdown on mobile */}
                </PopoverContent>
              </Popover>

              {/* Logo -- always links to Home (/) */}
              <Link
                to="/"
                onClick={(e) => { if (isLocked) e.preventDefault(); }}
                className={cn(
                  // UI-SPEC F4 (XD-11): the logo link is an interactive element and needs
                  // the 44px floor; the logo image itself is untouched.
                  "flex min-h-11 min-w-11 items-center justify-center gap-2 flex-shrink-0 touch-manipulation group",
                  isLocked && "pointer-events-none"
                )}
              >
                <img
                  alt="Strivo"
                  src={strivoLogo}
                  loading="eager"
                  className="h-9 lg:h-10 w-auto object-contain transition-all duration-300 group-hover:drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)] group-hover:scale-105"
                />
              </Link>

              {/* Desktop NavigationMenu with underline active state */}
              <NavigationMenu className={cn("hidden lg:flex flex-1 justify-center", isLocked && "pointer-events-none opacity-60")}>
                <NavigationMenuList className="gap-0">
                  {activeLinks.map((l) => {
                    // Phase 47 — D-01: disabled + 'Coming Soon' tooltip when flag off.
                    const linkDisabled = "disabled" in l && (l as { disabled?: boolean }).disabled === true;
                    const linkEl = (
                      <Link
                        to={linkDisabled ? "#" : l.to}
                        aria-disabled={linkDisabled ? true : undefined}
                        onClick={(e) => {
                          if (isLocked || linkDisabled) e.preventDefault();
                        }}
                        className={cn(
                          "px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-200 border-b-2",
                          isActive(l.to)
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                          linkDisabled && "opacity-50 cursor-not-allowed pointer-events-none"
                        )}
                      >
                        {l.label}
                      </Link>
                    );
                    return (
                      <NavigationMenuItem key={l.to}>
                        <NavigationMenuLink asChild>
                          {linkDisabled ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>{linkEl}</span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                {l.label} · Coming Soon
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            linkEl
                          )}
                        </NavigationMenuLink>
                      </NavigationMenuItem>
                    );
                  })}
                </NavigationMenuList>
              </NavigationMenu>
            </div>

            {/* RIGHT GROUP: Admin Tier Switcher | Credits Badge | ThemeToggle | Actions */}
            <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">

              {/* Admin tier switcher -- desktop only */}
              {user && isAdmin && (
                <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border border-violet-500/30 rounded-lg">
                  <Shield className="h-4 w-4 text-violet-400" />
                  <Select
                    value={testTier || 'admin'}
                    onValueChange={(value) => setTestTier(value === 'admin' ? null : value)}
                  >
                    <SelectTrigger className="h-7 w-28 text-xs bg-background/50 border-violet-500/30">
                      <SelectValue placeholder="View as..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-border z-[100]">
                      <SelectItem value="free" className="text-xs">Free</SelectItem>
                      <SelectItem value="elite" className="text-xs">
                        <span className="flex items-center gap-1"><Crown className="h-3 w-3 text-purple-400" />Elite</span>
                      </SelectItem>
                      <SelectItem value="admin" className="text-xs">
                        <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-violet-400" />Admin View</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Out of Merits badge -- desktop only */}
              {user && isZero && (
                <div className="hidden lg:block">
                  <Badge variant="destructive" className="flex items-center gap-1 cursor-help">
                    <AlertCircle className="w-3 h-3" />
                    Out of Merits
                  </Badge>
                </div>
              )}

              {/* ThemeToggle -- single instance, always visible */}
              <ThemeToggle />

              {/* Logged-out mobile CTA buttons */}
              {!user && (
                <div className="flex items-center gap-2 lg:hidden">
                  <Button asChild variant="ghost" size="sm" className="px-2.5 sm:px-3">
                    <Link to="/auth">Sign In</Link>
                  </Button>
                  <Button asChild size="sm" className="px-2.5 sm:px-3">
                    <Link to="/auth">Get Started</Link>
                  </Button>
                </div>
              )}

              {/* Desktop-only action buttons */}
              <div className="hidden lg:flex items-center gap-2">
                {user ? (
                  <>
                    {/* Avatar Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild disabled={isLocked}>
                        <button
                          type="button"
                          aria-label="Account menu"
                          disabled={isLocked}
                          className={cn(
                            // UI-SPEC F4 (XD-11): the 32x32 avatar trigger gets a 44x44 hit area.
                            "flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full touch-manipulation focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
                            isLocked && "opacity-60 pointer-events-none"
                          )}
                        >
                          <Avatar className="h-8 w-8 border-2 border-border hover:border-primary transition-colors cursor-pointer">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                              {getUserInitials()}
                            </AvatarFallback>
                          </Avatar>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 backdrop-blur-xl bg-background/80 border-border/50">
                        <div className="px-3 py-2 border-b border-border/50">
                          <p className="text-sm font-medium truncate">
                            {profile?.full_name || user?.email}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                              {getTierLabel()}
                            </span>
                            {credits && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Zap className="w-3 h-3" />
                                {credits.used}/{credits.limit}
                              </span>
                            )}
                          </div>
                        </div>

                        <DropdownMenuItem asChild disabled={isLocked}>
                          <Link to="/profile" className="flex items-center gap-2 cursor-pointer">
                            <User className="w-4 h-4" />
                            Profile
                          </Link>
                        </DropdownMenuItem>

                        <DropdownMenuItem asChild disabled={isLocked}>
                          <Link to="/pricing" className="flex items-center gap-2 cursor-pointer">
                            <CreditCard className="w-4 h-4" />
                            Billing / Membership
                          </Link>
                        </DropdownMenuItem>

                        {profile?.subscription_tier === "free" && (
                          <DropdownMenuItem asChild disabled={isLocked}>
                            <Link
                              to="/pricing"
                              className="flex items-center gap-2 cursor-pointer text-amber-500"
                            >
                              <Zap className="w-4 h-4" />
                              Upgrade Plan
                            </Link>
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          onClick={handleSignOut}
                          disabled={isLocked}
                          className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign out
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : (
                  <>
                    <Button asChild variant="ghost" size="sm" className="rounded-full text-muted-foreground hover:text-foreground">
                      <Link to="/auth">Sign In</Link>
                    </Button>
                    <Button asChild size="sm" className="rounded-full">
                      <Link to="/auth">Get Started</Link>
                    </Button>
                  </>
                )}
              </div>

              {/* Mobile-only avatar for logged-in users */}
              {user && (
                <div className="lg:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild disabled={isLocked}>
                      <button
                        type="button"
                        aria-label="Account menu"
                        disabled={isLocked}
                        className={cn(
                          // UI-SPEC F4 (XD-11): the 32x32 avatar trigger gets a 44x44 hit area.
                            "flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full touch-manipulation focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
                          isLocked && "opacity-60 pointer-events-none"
                        )}
                      >
                        <Avatar className="h-8 w-8 border-2 border-border hover:border-primary transition-colors cursor-pointer">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                            {getUserInitials()}
                          </AvatarFallback>
                        </Avatar>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 backdrop-blur-xl bg-background/80 border-border/50">
                      <div className="px-3 py-2 border-b border-border/50">
                        <p className="text-sm font-medium truncate">
                          {profile?.full_name || user?.email}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            {getTierLabel()}
                          </span>
                          {credits && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Zap className="w-3 h-3" />
                              {credits.used}/{credits.limit}
                            </span>
                          )}
                        </div>
                      </div>

                      <DropdownMenuItem asChild disabled={isLocked}>
                        <Link to="/profile" className="flex items-center gap-2 cursor-pointer">
                          <User className="w-4 h-4" />
                          Profile
                        </Link>
                      </DropdownMenuItem>

                      <DropdownMenuItem asChild disabled={isLocked}>
                        <Link to="/pricing" className="flex items-center gap-2 cursor-pointer">
                          <CreditCard className="w-4 h-4" />
                          Billing / Membership
                        </Link>
                      </DropdownMenuItem>

                      {profile?.subscription_tier === "free" && (
                        <DropdownMenuItem asChild disabled={isLocked}>
                          <Link
                            to="/pricing"
                            className="flex items-center gap-2 cursor-pointer text-amber-500"
                          >
                            <Zap className="w-4 h-4" />
                            Upgrade Plan
                          </Link>
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onClick={handleSignOut}
                        disabled={isLocked}
                        className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

    </>
  );
};
