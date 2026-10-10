import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { CapabilityBanner } from "@/components/platform/CapabilityGate";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

// UI-SPEC B1: the degraded banner sits inside the authenticated app shell, directly
// under the navbar, in NORMAL DOCUMENT FLOW — never `position: fixed`, which would eat
// mobile viewport. It renders nothing at all in `supported` tier.
export const DashboardLayout = ({ children }: DashboardLayoutProps) => (
  <div className="min-h-viewport bg-background">
    <AppSidebar />
    <div className="min-w-0 pl-14 sm:pl-[72px]">
      <TopBar />
      <CapabilityBanner />
      <main className="app-shell-content min-w-0 overflow-x-clip pb-[env(safe-area-inset-bottom,0px)]">
        {children}
      </main>
    </div>
  </div>
);
