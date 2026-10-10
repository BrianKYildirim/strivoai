import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { queryClient } from "@/lib/queryClient";
import { AuthCacheSync } from "@/components/AuthCacheSync";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/DashboardLayout";
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from '@vercel/analytics/react';
import { ScrollToTop } from "@/components/ScrollToTop";

import { AdminTierTestProvider } from "@/contexts/AdminTierTestContext";
import { AnalysisLockProvider } from "@/contexts/AnalysisLockContext";
import { AnalysisWaitingHost } from "@/components/AnalysisWaitingHost";
import { TopUpProvider } from "@/components/topup/TopUpProvider";
// Landing page stays eager (first paint — no spinner on the very first load).
import Index from "./pages/Index";
import AnalysisErrorBoundary from "./components/AnalysisErrorBoundary";
import ExploreFeatures from "./components/ExploreFeatures";
import { isInterviewPrepEnabled } from "./config/feature-flags";

// Route-level code splitting (perf): every non-landing page loads on demand, so a
// visitor to "/" no longer downloads the admin, results, recruiting-lens, etc.
// code (and their heavy deps like framer-motion/confetti) up front.
const Auth = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Upload = lazy(() => import("./pages/Upload"));
const Results = lazy(() => import("./pages/Results"));
const Improvements = lazy(() => import("./pages/Improvements"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Jobs = lazy(() => import("./pages/Jobs"));
const LinkedInGrader = lazy(() => import("./pages/LinkedInGrader"));
const CareerCompass = lazy(() => import("./pages/CareerCompass"));
const Profile = lazy(() => import("./pages/Profile"));
const AnalysisHistory = lazy(() => import("./pages/AnalysisHistory"));
const AdminUsage = lazy(() => import("./pages/AdminUsage"));
const RecruitingLens = lazy(() => import("./pages/RecruitingLens"));
const InterviewPrep = lazy(() => import("./pages/InterviewPrep"));
const ComingSoon = lazy(() => import("./pages/ComingSoon"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Refund = lazy(() => import("./pages/Refund"));
const Pricing = lazy(() => import("./pages/Pricing"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const Questions = lazy(() => import("./pages/Questions"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Applications = lazy(() => import("./pages/Applications"));
const Celebrations = lazy(() => import("./pages/Celebrations"));

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center" aria-busy="true" aria-live="polite">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    <span className="sr-only">Loading…</span>
  </div>
);

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <AuthCacheSync />
      <AdminTierTestProvider>
        <AnalysisLockProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <AnalysisWaitingHost />

            <BrowserRouter>
              <ScrollToTop />
              <TopUpProvider>
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/onboarding" element={<ProtectedRoute skipOnboardingCheck><DashboardLayout><Onboarding /></DashboardLayout></ProtectedRoute>} />
                <Route path="/upload" element={<ProtectedRoute><DashboardLayout><AnalysisErrorBoundary stage="upload"><Upload /></AnalysisErrorBoundary></DashboardLayout></ProtectedRoute>} />
                <Route path="/results/:id" element={<ProtectedRoute><DashboardLayout><AnalysisErrorBoundary stage="render"><Results /></AnalysisErrorBoundary></DashboardLayout></ProtectedRoute>} />
                <Route path="/improvements/:id" element={<ProtectedRoute><DashboardLayout><Improvements /></DashboardLayout></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><Dashboard /></DashboardLayout></ProtectedRoute>} />
                <Route path="/jobs" element={<ProtectedRoute><DashboardLayout><Jobs /></DashboardLayout></ProtectedRoute>} />
                <Route path="/linkedin-grader" element={<ProtectedRoute><DashboardLayout><LinkedInGrader /></DashboardLayout></ProtectedRoute>} />
                <Route path="/career-compass" element={<ProtectedRoute><DashboardLayout><CareerCompass /></DashboardLayout></ProtectedRoute>} />
                <Route path="/history" element={<ProtectedRoute><DashboardLayout><AnalysisHistory /></DashboardLayout></ProtectedRoute>} />
                <Route path="/admin/usage" element={<ProtectedRoute><DashboardLayout><AdminUsage /></DashboardLayout></ProtectedRoute>} />
                <Route path="/recruiting-lens" element={<ProtectedRoute><DashboardLayout><RecruitingLens /></DashboardLayout></ProtectedRoute>} />
                {/* Phase 47 — Interview Prep production gate (D-01, D-07, D-08).
                    Flag off (Production scope) → <ComingSoon />; flag on (Preview scope) → real page. */}
                <Route path="/interview-prep" element={<ProtectedRoute><DashboardLayout>{isInterviewPrepEnabled() ? <InterviewPrep /> : <ComingSoon />}</DashboardLayout></ProtectedRoute>} />
                <Route path="/celebrations" element={<ProtectedRoute><DashboardLayout><Celebrations /></DashboardLayout></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><DashboardLayout><Profile /></DashboardLayout></ProtectedRoute>} />
                <Route path="/applications" element={<ProtectedRoute><DashboardLayout><Applications /></DashboardLayout></ProtectedRoute>} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/refund" element={<Refund />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/how-it-works" element={<HowItWorks />} />
                <Route path="/questions" element={<Questions />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
              <ExploreFeatures />
              </TopUpProvider>
            </BrowserRouter>
          </TooltipProvider>
        </AnalysisLockProvider>
      </AdminTierTestProvider>
    </QueryClientProvider>
    <SpeedInsights />
    <Analytics />
  </HelmetProvider>
);

export default App;
