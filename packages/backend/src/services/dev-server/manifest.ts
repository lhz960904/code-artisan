import { z } from "zod";
import { SANDBOX_WORKSPACE_ROOT } from "@code-artisan/shared";
import type { E2BSandbox } from "../../sandbox/e2b-sandbox";

const devCommandSchema = z.union([
  z.string().min(1),
  z.object({
    command: z.string().min(1),
    cwd: z.string().optional(),
    port: z.number().int().positive().max(65535).optional(),
  }),
]);

const buildCommandSchema = z.union([
  z.string().min(1),
  z.object({
    command: z.string().min(1),
    output: z.string().optional(),
  }),
]);

export const manifestSchema = z.object({
  version: z.literal(1),
  name: z.string().optional(),
  scripts: z
    .object({
      install: z.string().optional(),
      dev: devCommandSchema.optional(),
      build: buildCommandSchema.optional(),
    })
    .optional(),
  deploy: z
    .object({
      type: z.enum(["static", "node", "edge"]).optional(),
      buildOutput: z.string().optional(),
    })
    .optional(),
});

export type Manifest = z.infer<typeof manifestSchema>;
export type DevCommand = NonNullable<NonNullable<Manifest["scripts"]>["dev"]>;

export interface NormalizedDevCommand {
  command: string;
  cwd?: string;
  port?: number;
}

export function normalizeDevCommand(dev: DevCommand | undefined): NormalizedDevCommand | null {
  if (dev === undefined) return null;
  if (typeof dev === "string") return { command: dev };
  return { ...dev };
}

export const MANIFEST_DIR = `${SANDBOX_WORKSPACE_ROOT}/.code-artisan`;
export const MANIFEST_PATH = `${MANIFEST_DIR}/manifest.json`;

export async function readManifest(sandbox: E2BSandbox): Promise<Manifest | null> {
  let raw: string;
  try {
    raw = await sandbox.readFile(MANIFEST_PATH);
  } catch {
    return null;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    console.warn(`[manifest] JSON parse failed for ${MANIFEST_PATH}:`, err);
    return null;
  }

  const result = manifestSchema.safeParse(json);
  if (!result.success) {
    console.warn(`[manifest] schema validation failed:`, result.error.issues);
    return null;
  }
  return result.data;
}
