import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/index.js";
import { user, session, account, verification, userQuotas } from "./db/schema.js";
import { env } from "./env.js";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.BETTER_AUTH_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
  emailAndPassword: { enabled: false },
  databaseHooks: {
    user: {
      create: {
        after: async (newUser) => {
          // Grant default quota on first login. Defaults on the column
          // (totalTokens=1_000_000, usedTokens=0) fill the rest.
          await db.insert(userQuotas).values({ userId: newUser.id }).onConflictDoNothing();
        },
      },
    },
  },
});

export type Auth = typeof auth;
export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;
