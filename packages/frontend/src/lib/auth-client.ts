import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Same-origin; Vite proxies /api → backend. better-auth requires an absolute URL.
  baseURL: `${window.location.origin}/api/auth`,
});

export const { signIn, signOut, useSession, getSession } = authClient;
