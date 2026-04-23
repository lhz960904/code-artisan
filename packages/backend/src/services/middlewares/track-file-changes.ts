import binaryExtensions from "binary-extensions";
import type { AgentMiddleware, Sandbox } from "@code-artisan/agent";
import { SANDBOX_WORKSPACE_ROOT, SANDBOX_IGNORED_DIRS } from "@code-artisan/shared";

const DEFAULT_MAX_FILE_SIZE = 500 * 1024;
const WRITE_TOOLS = new Set(["write_file", "str_replace"]);
// mtime baseline file used by incremental scans (-newer marker).
const SCAN_MARKER_PATH = "/tmp/.agent-scan-marker";

// Sandbox.readFile returns UTF-8 decoded strings and the DB text column
// rejects NUL bytes, so binary files (images, fonts, archives, ...) can't
// round-trip. List comes from sindresorhus/binary-extensions — community
// maintained, updated periodically. The AI is instructed to prefer inline
// SVG / external CDN URLs instead.
const BINARY_EXTENSION_SET = new Set(binaryExtensions);

function isBinaryPath(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  return BINARY_EXTENSION_SET.has(path.slice(dot + 1).toLowerCase());
}

// Fallback for files whose extension isn't in the binary list but whose
// content clearly isn't text (contains NUL). Runs after readFile so we
// don't upsert garbage that would crash the text column on write.
function looksBinaryContent(content: string): boolean {
  return content.includes("\0");
}

// Generated from SANDBOX_IGNORED_DIRS so the exclude list stays in sync
// with the frontend's defensive filter. Matches any depth: `./x/dir/*`,
// `./*/x/dir/*`, etc. — `find -path` semantics.
const IGNORE_FIND_ARGS = [
  ...SANDBOX_IGNORED_DIRS.map((dir) => `-not -path './${dir}/*' -not -path './*/${dir}/*'`),
  "-not -name '*.log'",
].join(" ");

export interface FileTrackerOptions {
  sandbox: Sandbox;
  workspaceRoot?: string;
  maxFileSize?: number;
  /**
   * Pre-seed the baseline manifest, skipping the sandbox-side scan. Pass the
   * known {absPath -> content} map (e.g. from just-restored snapshots) to
   * avoid a redundant find + readFile pass on agent run start.
   */
  initialManifest?: Map<string, string>;
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
 * Strategy: remote sandboxes have no efficient inotify API, so we do
 * snapshot-diff per tool call with two optimisations:
 *   1. `-newer <marker>` incremental scan — unchanged files pay zero I/O,
 *      only files mutated since the last reconcile are hashed.
 *   2. `listAllPaths` (no hash) — cheap enumeration used solely to detect
 *      deletions by set-difference against the manifest.
 *
 * - `write_file` / `str_replace`: known path → read once, diff locally.
 * - `bash`: unknown paths → incremental rescan, diff against manifest.
 * - `beforeAgentRun`: builds baseline manifest + plants scan marker.
 * - `afterAgentRun`: hands off the final manifest for DB persistence.
 */
export function fileTrackerMiddleware(opts: FileTrackerOptions): AgentMiddleware {
  const workspaceRoot = opts.workspaceRoot ?? SANDBOX_WORKSPACE_ROOT;
  const maxFileSize = opts.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const manifest = new Map<string, ManifestEntry>();

  const sizeArg = `-size -${Math.floor(maxFileSize / 1024) + 1}k`;

  /** List all current file paths (no hashing) — cheap, used to detect deletions. */
  async function listAllPaths(sandbox: Sandbox): Promise<Set<string>> {
    const cmd = `find . -type f ${IGNORE_FIND_ARGS} ${sizeArg}`;
    const res = await sandbox.exec(cmd, { cwd: workspaceRoot });
    if (res.exitCode !== 0) {
      console.error("[FileTracker] listAllPaths failed:", res.stderr);
      return new Set();
    }
    const out = new Set<string>();
    for (const line of res.stdout.split("\n")) {
      if (!line) continue;
      out.add(line.startsWith("./") ? line.slice(2) : line);
    }
    return out;
  }

  /**
   * Hash only files whose ctime is newer than the marker. This is the hot
   * path of our change detection: unchanged files pay zero I/O.
   *
   * ctime, not mtime: `mv`, `cp -p`, `tar x --preserve`, etc. preserve
   * source mtime so `-newer` would miss them. ctime (inode metadata
   * change time) updates on any rename/link/chmod/write so it's a strict
   * superset — any mtime change also bumps ctime.
   */
  async function scanChangedSince(sandbox: Sandbox, markerPath: string): Promise<Map<string, string>> {
    const cmd = `find . -type f ${IGNORE_FIND_ARGS} ${sizeArg} -cnewer ${markerPath} -exec sha256sum {} \\;`;
    const res = await sandbox.exec(cmd, { cwd: workspaceRoot });
    if (res.exitCode !== 0) {
      console.error("[FileTracker] scanChangedSince failed:", res.stderr);
      return new Map();
    }
    const out = new Map<string, string>();
    for (const line of res.stdout.split("\n")) {
      const m = line.match(/^([a-f0-9]+)\s+(.+)$/);
      if (!m) continue;
      const [, hash, relPath] = m;
      const clean = relPath.startsWith("./") ? relPath.slice(2) : relPath;
      out.set(clean, hash);
    }
    return out;
  }

  /** Advance the scan marker to "now" so future -newer lookups are incremental. */
  async function touchMarker(sandbox: Sandbox): Promise<void> {
    await sandbox.exec(`touch ${SCAN_MARKER_PATH}`);
  }

  function toAbs(relPath: string): string {
    return `${workspaceRoot}/${relPath}`;
  }

  function toRel(path: string): string {
    if (path.startsWith(workspaceRoot + "/")) return path.slice(workspaceRoot.length + 1);
    return path;
  }

  async function trackSingleFile(absPath: string): Promise<void> {
    // Path safety: a misbehaving LLM could write outside the workspace
    // (e.g. to /home/user/.bashrc). Don't track those — keep the manifest
    // and DB snapshots scoped to the project.
    if (absPath !== workspaceRoot && !absPath.startsWith(workspaceRoot + "/")) {
      console.warn(`[FileTracker] ignoring out-of-workspace write: ${absPath}`);
      return;
    }
    if (isBinaryPath(absPath)) return;
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
    if (looksBinaryContent(content)) return;
    const hash = await hashString(content);
    if (manifest.get(relPath)?.hash === hash) return;
    manifest.set(relPath, { hash, content });
    opts.onFileChanged([{ path: absPath, content }]);
  }

  async function reconcileBash(): Promise<void> {
    // Incremental: hash only files modified since last marker + enumerate
    // current paths (no hash) to spot deletions. Runs in parallel in sandbox.
    const [currentPaths, changedHashes] = await Promise.all([
      listAllPaths(opts.sandbox),
      scanChangedSince(opts.sandbox, SCAN_MARKER_PATH),
    ]);

    const updates: Array<{ path: string; content: string }> = [];
    for (const [relPath, hash] of changedHashes) {
      if (isBinaryPath(relPath)) continue;
      // sha256 matched: touch/noop; skip readFile.
      if (manifest.get(relPath)?.hash === hash) continue;
      try {
        const content = await opts.sandbox.readFile(toAbs(relPath));
        if (content.length > maxFileSize) continue;
        if (looksBinaryContent(content)) continue;
        manifest.set(relPath, { hash, content });
        updates.push({ path: toAbs(relPath), content });
      } catch (err) {
        console.error("[FileTracker] readFile failed:", relPath, err);
      }
    }

    const deleted: string[] = [];
    for (const relPath of manifest.keys()) {
      if (!currentPaths.has(relPath)) {
        manifest.delete(relPath);
        deleted.push(relPath);
      }
    }

    if (updates.length > 0) opts.onFileChanged(updates);
    if (deleted.length > 0) opts.onFileDeleted(deleted.map(toAbs));

    // Advance marker so next reconcile is truly incremental.
    await touchMarker(opts.sandbox);
  }

  return {
    beforeAgentRun: async () => {
      // Fast path: caller pre-seeded the manifest (e.g. from just-restored
      // snapshots). The sandbox state is authoritative — but we just wrote
      // it, so a remote scan would only re-read what we already have.
      // `touchMarker` is independent of the hashing work — run in parallel.
      if (opts.initialManifest && opts.initialManifest.size > 0) {
        await Promise.all([
          touchMarker(opts.sandbox),
          (async () => {
            for (const [absPath, content] of opts.initialManifest!) {
              if (content.length > maxFileSize) continue;
              const relPath = toRel(absPath);
              const hash = await hashString(content);
              manifest.set(relPath, { hash, content });
            }
          })(),
        ]);
        return;
      }
      // Cold path: enumerate sandbox files and seed the manifest. We hash
      // locally after readFile, so no sandbox-side sha256sum is needed.
      // listAllPaths + touchMarker are independent exec roundtrips — parallel
      // saves one full RTT on a fresh/empty sandbox (the common first-turn case).
      const [paths] = await Promise.all([listAllPaths(opts.sandbox), touchMarker(opts.sandbox)]);
      for (const relPath of paths) {
        if (isBinaryPath(relPath)) continue;
        try {
          const content = await opts.sandbox.readFile(toAbs(relPath));
          if (content.length > maxFileSize) continue;
          if (looksBinaryContent(content)) continue;
          const hash = await hashString(content);
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
