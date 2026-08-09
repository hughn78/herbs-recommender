import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { DisclaimerFooter } from "@/components/disclaimer-footer";

export const Route = createFileRoute("/app")({
  ssr: false,
  // Clinical review is public: no patient identifiers are stored.
  // Only /app/_admin/* pages require sign-in (see app._admin.tsx).
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex h-14 items-center justify-between border-b border-hairline bg-card px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="font-display text-sm text-foreground">
                Pharmacy Recommendation Engine
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-subtle">
              <span className="h-1.5 w-1.5 rounded-full bg-amber" />
              Deterministic rules · Governed catalogue · Staff only
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
          <DisclaimerFooter />
        </div>
      </div>
    </SidebarProvider>
  );
}
