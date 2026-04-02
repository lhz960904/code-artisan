import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { AppSidebar } from "@/components/layout/app-sidebar";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const location = useLocation();
  const isChat = location.pathname.startsWith("/chat/");

  return (
    <div className="flex h-screen bg-background text-foreground">
      {!isChat && <AppSidebar />}

      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
