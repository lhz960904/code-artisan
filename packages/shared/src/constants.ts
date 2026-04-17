/**
 * Workspace conventions shared by backend (sandbox scan / persistence)
 * and frontend (file-tree rendering). Keep these in sync with what the
 * agent's system prompt tells the LLM about where it operates.
 */

/** Root directory inside the sandbox where all user project files live. */
export const SANDBOX_WORKSPACE_ROOT = "/home/user/project";

/**
 * Directory names that are never scanned, streamed, or persisted.
 * Matching is by path segment, so e.g. "node_modules" catches any depth.
 */
export const SANDBOX_IGNORED_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "coverage",
  ".venv",
  "__pycache__",
] as const;
