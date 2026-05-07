import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  LLM_API_KEY: z.string().min(1),
  LLM_BASE_URL: z.url().optional(),
  E2B_API_KEY: z.string().min(1),
  TAVILY_API_KEY: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  INTEGRATION_SECRET_KEY: z.string().optional(),
  VERCEL_OAUTH_CLIENT_ID: z.string().optional(),
  VERCEL_OAUTH_CLIENT_SECRET: z.string().optional(),
  VERCEL_OAUTH_REDIRECT_URI: z.url().optional(),
  VERCEL_INTEGRATION_SLUG: z.string().optional(),
  SUPABASE_OAUTH_CLIENT_ID: z.string().optional(),
  SUPABASE_OAUTH_CLIENT_SECRET: z.string().optional(),
  SUPABASE_OAUTH_REDIRECT_URI: z.url().optional(),
  SUPABASE_OAUTH_SCOPE: z.string().optional(),
});

export const env = envSchema.parse(process.env);
