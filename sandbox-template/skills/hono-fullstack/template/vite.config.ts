import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import devServer from "@hono/vite-dev-server";
import bunAdapter from "@hono/vite-dev-server/bun";
import codeArtisanRuntime from "./.code-artisan/vite-plugin.js";

export default defineConfig({
  plugins: [
    codeArtisanRuntime(),
    react(),
    devServer({
      entry: "server/index.ts",
      adapter: bunAdapter(),
      exclude: [/^(?!\/api).*/],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});
