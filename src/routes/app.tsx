import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { DisclaimerFooter } from "@/components/disclaimer-footer";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app")({
  ssr: false,
  beforeLoad: async () => {
    // Phase 13: clinical reviews contain patient context and must never be
    // reachable anonymously. Reference-data reads remain public elsewhere.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
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
