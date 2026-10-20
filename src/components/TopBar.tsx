import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, CreditCard, LogOut, Shield, Crown, Zap } from "lucide-react";
import { useThemeLogo } from "@/hooks/useThemeLogo";
import { supabase } from "@/lib/supabaseClient";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LowBalanceWarning } from "@/components/LowBalanceWarning";
import { MeritBalanceHeaderV2 } from "@/components/topup/MeritBalanceHeaderV2";
import { HeaderTopUpTrigger } from "@/components/topup/HeaderTopUpTrigger";
import { useAdminTierTest } from "@/contexts/AdminTierTestContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getTierDisplayName } from "@/config/pricing-config";

export const TopBar = () => {
  const strivoLogo = useThemeLogo();
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<{
    full_name?: string;
    subscription_tier?: string;
  } | null>(null);
  const { isAdmin, testTier, setTestTier } = useAdminTierTest();

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
        return;
      }
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, subscription_tier")
        .eq("id", user.id)
        .single();
      if (!cancelled && profileData) setProfile(profileData);
    };
    refresh();
    window.addEventListener("strivo:profile-updated", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("strivo:profile-updated", refresh);
    };
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
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

  return (
    <>
      <div className="flex min-h-16 min-w-0 items-center justify-end px-1.5 pt-[env(safe-area-inset-top,0px)] sm:px-4 md:justify-between lg:px-6">
        {/* LEFT: Logo */}
        <Link to="/" className="hidden md:flex items-center gap-2 flex-shrink-0 group">
          <img
            alt="Strivo"
            src={strivoLogo}
            loading="eager"
            className="h-9 w-auto object-contain transition-all duration-300 group-hover:drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)] group-hover:scale-105"
          />
        </Link>

        {/* RIGHT: Admin switcher, merit badge, theme toggle, avatar */}
        {/* UI-SPEC F4 (XD-12): the merit-balance / theme-toggle / account cluster
            sat 4px apart; the contract floor is 8px. */}
        <div className="flex min-w-0 items-center gap-2 lg:gap-3">
          {/* Admin tier switcher */}
          {user && isAdmin && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border border-violet-500/30 rounded-lg">
              <Shield className="h-4 w-4 text-violet-400" />
              <Select
                value={testTier || "admin"}
                onValueChange={(value) =>
                  setTestTier(value === "admin" ? null : value)
                }
              >
                <SelectTrigger className="h-7 w-28 text-xs bg-background/50 border-violet-500/30">
                  <SelectValue placeholder="View as..." />
                </SelectTrigger>
                <SelectContent className="bg-background border-border z-[100]">
                  <SelectItem value="free" className="text-xs">
                    Free
                  </SelectItem>
                  <SelectItem value="elite" className="text-xs">
                    <span className="flex items-center gap-1">
                      <Crown className="h-3 w-3 text-purple-400" />
                      Elite
                    </span>
                  </SelectItem>
                  <SelectItem value="admin" className="text-xs">
                    <span className="flex items-center gap-1">
                      <Shield className="h-3 w-3 text-violet-400" />
                      Admin View
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Merit balance header + top-up trigger (Phase 24 Plan 06 — SC-9b/SC-10) */}
          {user && (
            <>
              <MeritBalanceHeaderV2 />
              <HeaderTopUpTrigger />
            </>
          )}

          {/* Theme toggle */}
          <ThemeToggle />

          {/* User avatar dropdown */}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="flex min-h-11 min-w-11 md:min-h-0 md:min-w-0 touch-manipulation items-center justify-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                >
                  <Avatar className="h-8 w-8 border-2 border-border hover:border-primary transition-colors cursor-pointer">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 backdrop-blur-xl bg-background/80 border-border/50"
              >
                <div className="px-3 py-2 border-b border-border/50">
                  <p className="text-sm font-medium truncate">
                    {profile?.full_name || user?.email}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {getTierLabel()}
                    </span>
                  </div>
                </div>

                <DropdownMenuItem asChild>
                  <Link
                    to="/profile"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <User className="w-4 h-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    to="/pricing"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4" />
                    Billing / Membership
                  </Link>
                </DropdownMenuItem>

                {profile?.subscription_tier === "free" && (
                  <DropdownMenuItem asChild>
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
                  className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* UX-03 (D-05a): Mounted once for the dashboard shell so every
          authenticated route surfaces the banner when total drops below
          threshold or hits zero. Component self-guards on isLoading +
          threshold so it is safe to render unconditionally. */}
      <LowBalanceWarning />
    </>
  );
};
