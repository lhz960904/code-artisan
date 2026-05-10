import { config } from "dotenv";
config({ path: "../../.env" });

const TEST_ENV_DEFAULTS: Record<string, string> = {
  INTEGRATION_SECRET_KEY: Buffer.alloc(32, 1).toString("base64"),
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  SUPABASE_SECRET_KEY: "test-secret-key",
  LLM_API_KEY: "test-llm-key",
  E2B_API_KEY: "test-e2b-key",
  BETTER_AUTH_SECRET: "test-auth-secret-32-bytes-minimum-length",
  BETTER_AUTH_URL: "http://localhost:3001",
  GITHUB_CLIENT_ID: "test-github-client-id",
  GITHUB_CLIENT_SECRET: "test-github-client-secret",
};

for (const [k, v] of Object.entries(TEST_ENV_DEFAULTS)) {
  if (!process.env[k]) process.env[k] = v;
}
