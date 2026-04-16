import type { AgentMiddleware, Sandbox } from "@code-artisan/agent";

const DEFAULT_MAX_FILE_SIZE = 500 * 1024;
const DEFAULT_WORKSPACE_ROOT = "/home/user";
const WRITE_TOOLS = new Set(["write_file", "str_replace"]);

// Must match the find command below. Paths starting with these prefixes
// (relative to workspaceRoot) are ignored from scans.
const IGNORE_FIND_ARGS = [
  "-not -path './node_modules/*'",
  "-not -path './.git/*'",
  "-not -path './dist/*'",
  "-not -path './build/*'",
  "-not -path './.next/*'",
  "-not -path './.cache/*'",
  "-not -path './.turbo/*'",
  "-not -name '*.log'",
].join(" ");

export interface FileTrackerOptions {
  sandbox: Sandbox;
  workspaceRoot?: string;
  maxFileSize?: number;
  /** Real-time: a tracked file was created or modified. */
  onFileChanged: (files: Array<{ path: string; content: string }>) => void;
  /** Real-time: a tracked file was removed. */
  onFileDeleted: (paths: string[]) => void;
  /**
   * End-of-run: the full final state of tracked files. Persist this as
   * authoritative — rows not in the manifest should be deleted from DB.
   */
  onPersist?: (manifest: Map<string, string>) => Promise<void>;
}

interface ManifestEntry {
  hash: string;
  content: string;
}

/**
 * Watches file changes caused by agent tools and mirrors them to the caller.
 *
 * - `write_file` / `str_replace`: known path → read once and diff.
 * - `bash`: unknown paths → rescan workspace via `find + sha256sum`, diff
 *   against manifest, emit creates/updates/deletes.
 * - `beforeAgentRun`: builds baseline manifest from current sandbox state.
 * - `afterAgentRun`: hands off the final manifest for DB persistence.
 */
export function fileTrackerMiddleware(opts: FileTrackerOptions): AgentMiddleware {
  const workspaceRoot = opts.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT;
  const maxFileSize = opts.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const manifest = new Map<string, ManifestEntry>();

  async function scanHashes(sandbox: Sandbox): Promise<Map<string, string>> {
    const cmd = `find . -type f ${IGNORE_FIND_ARGS} -size -${Math.floor(maxFileSize / 1024) + 1}k -exec sha256sum {} \\;`;
    const res = await sandbox.exec(cmd, { cwd: workspaceRoot });
    if (res.exitCode !== 0) {
      console.error("[FileTracker] scan failed:", res.stderr);
      return new Map();
    }
    const out = new Map<string, string>();
    for (const line of res.stdout.split("\n")) {
      const m = line.match(/^([a-f0-9]+)\s+(.+)$/);
      if (!m) continue;
      const [, hash, relPath] = m;
      // find prints "./path"; strip the leading "./".
      const clean = relPath.startsWith("./") ? relPath.slice(2) : relPath;
      out.set(clean, hash);
    }
    return out;
  }

  function toAbs(relPath: string): string {
    return `${workspaceRoot}/${relPath}`;
  }

  function toRel(path: string): string {
    if (path.startsWith(workspaceRoot + "/")) return path.slice(workspaceRoot.length + 1);
    return path;
  }

  async function trackSingleFile(absPath: string): Promise<void> {
    // No size cap here on purpose: LLMs don't typically touch large vendored
    // files, and capping explicit write-tool output would silently break
    // tracking mid-run (e.g. a single source file growing past the limit).
    const relPath = toRel(absPath);
    let content: string;
    try {
      content = await opts.sandbox.readFile(absPath);
    } catch (err) {
      console.error("[FileTracker] readFile failed:", absPath, err);
      return;
    }
    const hash = await hashString(content);
    if (manifest.get(relPath)?.hash === hash) return;
    manifest.set(relPath, { hash, content });
    opts.onFileChanged([{ path: absPath, content }]);
  }

  async function reconcileBash(): Promise<void> {
    const next = await scanHashes(opts.sandbox);
    const changed: string[] = [];
    const deleted: string[] = [];

    for (const [relPath, hash] of next) {
      if (manifest.get(relPath)?.hash !== hash) changed.push(relPath);
    }
    for (const relPath of manifest.keys()) {
      if (!next.has(relPath)) deleted.push(relPath);
    }

    // Read content for changed paths.
    const updates: Array<{ path: string; content: string }> = [];
    for (const rel of changed) {
      try {
        const content = await opts.sandbox.readFile(toAbs(rel));
        if (content.length > maxFileSize) continue;
        manifest.set(rel, { hash: next.get(rel)!, content });
        updates.push({ path: toAbs(rel), content });
      } catch (err) {
        console.error("[FileTracker] readFile failed:", rel, err);
      }
    }
    for (const rel of deleted) manifest.delete(rel);

    if (updates.length > 0) opts.onFileChanged(updates);
    if (deleted.length > 0) opts.onFileDeleted(deleted.map(toAbs));
  }

  return {
    beforeAgentRun: async () => {
      // Build baseline (no emissions). Captures the state restored from
      // previous snapshots + anything present in the sandbox.
      const hashes = await scanHashes(opts.sandbox);
      for (const [relPath, hash] of hashes) {
        try {
          const content = await opts.sandbox.readFile(toAbs(relPath));
          if (content.length > maxFileSize) continue;
          manifest.set(relPath, { hash, content });
        } catch (err) {
          console.error("[FileTracker] baseline readFile failed:", relPath, err);
        }
      }
    },

    afterToolUse: async ({ toolUse }) => {
      if (WRITE_TOOLS.has(toolUse.name)) {
        const input = toolUse.input as { path?: unknown };
        if (typeof input.path === "string") await trackSingleFile(input.path);
        return;
      }
      if (toolUse.name === "bash") {
        await reconcileBash();
      }
    },

    afterAgentRun: async () => {
      if (!opts.onPersist) return;
      const out = new Map<string, string>();
      for (const [relPath, entry] of manifest) out.set(toAbs(relPath), entry.content);
      await opts.onPersist(out);
    },
  };
}

async function hashString(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
