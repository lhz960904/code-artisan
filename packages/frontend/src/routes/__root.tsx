import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div className="h-screen bg-[#0d1117] text-[#e6edf3]">
      <Outlet />
    </div>
  ),
});
