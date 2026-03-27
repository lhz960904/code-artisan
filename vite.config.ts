import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "packages/frontend/**/*.{js,ts,tsx}": "vp check --fix",
  },
});
