import { createRoute, Outlet } from "@tanstack/react-router";
import { rootRoute } from "@/pages/layout/root";

function AuthedLayout() {
  return <Outlet />;
}

export const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authed",
  component: AuthedLayout,
});
