import { Hono } from "hono";
import { SUPPORTED_MODELS } from "@code-artisan/shared";
import { ok } from "../http/index.js";

const modelsRouter = new Hono();

// v1: return full list. User-tier gating will filter / mark `locked` here later.
modelsRouter.get("/", async (c) => {
  return ok(c, SUPPORTED_MODELS);
});

export { modelsRouter };
