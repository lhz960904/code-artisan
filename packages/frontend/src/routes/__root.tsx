import { createRootRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getSession } from "@/lib/auth-client";

export const Route = createRootRoute({
  component: RootLayout,
  beforeLoad: async ({ location }) => {
    if (location.pathname.startsWith("/login")) return;
    const { data } = await getSession();
    if (!data?.session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
});

function RootLayout() {
  const location = useLocation();
  const isChat = location.pathname.startsWith("/chat/");
  const isAuthPage = location.pathname.startsWith("/login");

  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {!isChat && <AppSidebar />}

      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
