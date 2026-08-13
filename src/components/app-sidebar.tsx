import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Home, FilePlus2, ListChecks, BookOpen, Package, Inbox, ShieldCheck, Settings, LogOut, LogIn, ClipboardCheck, Pill, Lock, Search } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { CounterPointMark } from "@/components/counterpoint-mark";

const items = [
  { title: "Home", url: "/app", icon: Home },
  { title: "New review", url: "/app/review", icon: FilePlus2 },
  { title: "Search", url: "/app/search", icon: Search },
  { title: "Past reviews", url: "/app/cases", icon: ListChecks },
  { title: "Needs review", url: "/app/queue", icon: Inbox },
];

const staffItems = [
  { title: "Safety rules", url: "/app/rules", icon: ShieldCheck },
  { title: "References", url: "/app/references", icon: BookOpen },
  { title: "Products", url: "/app/products", icon: Package },
  { title: "Medicines", url: "/app/medicines", icon: Pill },
  { title: "Catalogue governance", url: "/app/governance", icon: ClipboardCheck },
  { title: "Set-up", url: "/app/setup", icon: Settings },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setSignedIn(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/app", replace: true });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/app" className="flex items-center gap-2 px-2 py-3" aria-label="CounterPoint home">
          <CounterPointMark size={28} compact />
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-sm text-foreground">CounterPoint</span>
            <span className="text-[10px] uppercase tracking-[0.16em] text-subtle">Supplement guidance</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={path === item.url}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>
            <span className="group-data-[collapsible=icon]:hidden">Staff tools</span>
            <Lock className="h-3 w-3 group-data-[collapsible=icon]:block hidden" aria-label="Staff tools (sign in required)" />
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {staffItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={path === item.url}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {!signedIn && (
                        <Lock
                          className="h-3 w-3 ml-auto text-subtle group-data-[collapsible=icon]:hidden"
                          aria-label="Sign in required"
                        />
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {signedIn ? (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link to="/auth" className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  <span>Sign in</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}