import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import codeArtisanRuntime from "./.code-artisan/vite-plugin.js";

export default defineConfig({
  plugins: [codeArtisanRuntime(), react()],
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
    outDir: "dist",
    emptyOutDir: true,
  },
});
