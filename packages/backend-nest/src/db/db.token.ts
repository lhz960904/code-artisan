import type { drizzle } from "drizzle-orm/postgres-js";
import type * as schema from "./schema.js";

export const DRIZZLE = Symbol("DRIZZLE");
export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;
