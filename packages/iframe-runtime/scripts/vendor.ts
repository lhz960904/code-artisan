import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DIST = path.resolve(SCRIPT_DIR, "../dist");

const ARTIFACTS = ["runtime.iife.js", "vite-plugin.js"];

const VENDOR_TARGETS = [
  "sandbox-template/skills/hono-fullstack/template/.code-artisan",
];

async function main() {
  for (const target of VENDOR_TARGETS) {
    const dest = path.join(REPO_ROOT, target);
    await mkdir(dest, { recursive: true });
    for (const file of ARTIFACTS) {
      await copyFile(path.join(DIST, file), path.join(dest, file));
    }
    console.log(`✓ vendored ${ARTIFACTS.length} files → ${target}`);
  }
}

main().catch((err) => {
  console.error("vendor failed:", err);
  process.exit(1);
});
