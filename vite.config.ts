import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*.{js,ts,tsx}": "vp check --fix",
  },
});
