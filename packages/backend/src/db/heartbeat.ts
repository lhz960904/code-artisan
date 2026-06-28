import { sql } from "drizzle-orm";
import { db } from "./index.js";

const HEARTBEAT_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function ping() {
  try {
    await db.execute(sql`select 1 from "user" limit 1`);
  } catch (err) {
    console.warn("[db-heartbeat] ping failed:", err);
  }
}

// Reads a real table on a timer so Supabase free-tier doesn't auto-pause the
// project after ~7 days of no database activity (which 500s every auth call).
export function startDbHeartbeat() {
  void ping();
  setInterval(() => void ping(), HEARTBEAT_INTERVAL_MS).unref?.();
}
