import { sValidator } from "@hono/standard-validator";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { ValidationTargets } from "hono";
import { badRequest } from "./response.js";

/**
 * Wraps `@hono/standard-validator`'s `sValidator` with our standard
 * `badRequest` envelope as the failure formatter.
 *
 * Works with any Standard Schema-compliant validator (zod 4, valibot, arktype,
 * etc.). Type generics flow through so `c.req.valid(target)` is fully typed.
 *
 *   router.post(
 *     "/:id",
 *     validate("param", paramSchema),
 *     validate("json", bodySchema),
 *     async (c) => {
 *       const { id } = c.req.valid("param");
 *       const body = c.req.valid("json");
 *     },
 *   );
 */
export const validate = <
  Schema extends StandardSchemaV1,
  Target extends keyof ValidationTargets,
>(
  target: Target,
  schema: Schema,
) =>
  sValidator(target, schema, (result, c) => {
    if (result.success) return;
    const issue = result.error[0];
    const path =
      issue.path?.map((p) => (typeof p === "object" ? p.key : p)).join(".") ?? "";
    return badRequest(c, path ? `${path}: ${issue.message}` : issue.message);
  });
