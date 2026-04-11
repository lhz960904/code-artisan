import { readdir, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileSnapshot } from "../types";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".venv", "venv",
  "dist", "build", ".next", ".nuxt", ".turbo", ".cache",
  ".DS_Store", "coverage", ".nyc_output",
]);

function isBinary(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, 512);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export async function getModifiedFiles(rootDir: string, since: number): Promise<FileSnapshot[]> {
  const results: FileSnapshot[] = [];

  async function scan(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        const info = await stat(fullPath);
        if (info.mtimeMs > since) {
          const buffer = await readFile(fullPath);
          if (!isBinary(buffer)) {
            results.push({
              path: fullPath,
              content: buffer.toString("utf-8"),
            });
          }
        }
      }
    }
  }

  await scan(rootDir);
  return results;
}
