import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Navbar } from "@/components/Navbar";
import { DashboardLayout } from "@/components/DashboardLayout";
import ActionFirstHero from "@/components/ActionFirstHero";
import DashboardHome from "@/components/DashboardHome";
import BelowFold from "@/components/BelowFold";
import { useToast } from "@/hooks/use-toast";

const HomepageRouter = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const hasShownSignOutToast = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;

    const applySession = (session: any) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
    };

    // Keep homepage in sync with auth changes (SIGNED_IN / SIGNED_OUT)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Show toast only once per sign-out event
      if (event === "SIGNED_OUT" && !hasShownSignOutToast.current) {
        hasShownSignOutToast.current = true;
        toast({
          title: "Signed out successfully",
          description: "You've been logged out of your account.",
        });
        // Reset flag after a short delay so future sign-outs can show toast
        setTimeout(() => {
          hasShownSignOutToast.current = false;
        }, 2000);
      }
      applySession(session);
    });

    // Initial session load
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        applySession(session);
      })
      .catch((err) => {
        console.warn("HomepageRouter: getSession failed, resolving as logged-out", err);
        applySession(null);
      });

    // Hard timeout safeguard (prevents infinite spinner on rare stalls)
    const timeout = window.setTimeout(() => {
      if (!mounted || !loading) return;

      // One last attempt: sometimes getSession stalls, but getUser succeeds.
      supabase.auth
        .getUser()
        .then(({ data: { user } }) => {
          if (!mounted) return;
          setUser(user ?? null);
          setLoading(false);
        })
        .catch((err) => {
          console.warn(
            "HomepageRouter: auth init timeout + getUser failed, resolving as logged-out",
            err
          );
          applySession(null);
        });
    }, 8000);

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-viewport bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Logged-in: Show dashboard-style home
  if (user) {
    return (
      <DashboardLayout>
        <DashboardHome />
      </DashboardLayout>
    );
  }

  // Logged-out: Show action-first hero + below fold content
  return (
    <div className="min-h-viewport bg-background text-foreground">
      <Navbar />
      <ActionFirstHero />
      <BelowFold />
    </div>
  );
};

export default HomepageRouter;
