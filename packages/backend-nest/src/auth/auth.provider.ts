import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Env } from "../config/env.schema.js";
import type { DrizzleDB } from "../db/db.token.js";
import { account, session, user, userQuotas, verification } from "../db/schema.js";

export const AUTH = Symbol("AUTH");

export function createAuth(env: Env, db: DrizzleDB) {
  return betterAuth({
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
            await db.insert(userQuotas).values({ userId: newUser.id }).onConflictDoNothing();
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthUser = Auth["$Infer"]["Session"]["user"];
export type AuthSession = Auth["$Infer"]["Session"]["session"];
