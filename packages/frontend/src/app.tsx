import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "@/contexts/theme-context";
import { chatRoute } from "@/pages/chat";
import { debugMessagesRoute } from "@/pages/debug-messages";
import { homeRoute } from "@/pages/home";
import { loginRoute } from "@/pages/login";
import { oauthReturnRoute } from "@/pages/oauth-return";
import { pricingRoute } from "@/pages/pricing";
import { authedRoute } from "@/pages/layout/authed";
import { rootRoute } from "@/pages/layout/root";
import { dashboardRoute } from "./pages/dashboard";

// appShellRoute.addChildren([mcpServersRoute])

const routeTree = rootRoute.addChildren([
  loginRoute,
  homeRoute,
  pricingRoute,
  oauthReturnRoute,
  debugMessagesRoute,
  authedRoute.addChildren([dashboardRoute, chatRoute]),
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
