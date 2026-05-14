/// <reference types="node" />
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../backend-nest/src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
