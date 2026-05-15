import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { DrizzleDB } from "../db/db.token.js";
import { account, session, user, userQuotas, verification } from "../db/schema.js";

export const AUTH = Symbol("AUTH");

export interface AuthConfig {
  secret: string;
  baseURL: string;
  github: { clientId: string; clientSecret: string };
}

export function createAuth(config: AuthConfig, db: DrizzleDB) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: [config.baseURL],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    socialProviders: {
      github: {
        clientId: config.github.clientId,
        clientSecret: config.github.clientSecret,
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
