/**
 * Abstract sandbox interface — represents the execution environment
 * where built-in tools (bash, file ops, glob, grep) actually run.
 *
 * The agent loop is environment-agnostic; concrete implementations
 * (LocalSandbox, E2BSandbox, etc.) are injected by the consumer.
 */
export interface Sandbox {
  /** Execute a shell command and return combined stdout/stderr. */
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  /** Read a text file. */
  readFile(path: string): Promise<string>;
  /** Write a text file. Creates parent directories if missing. */
  writeFile(path: string, content: string, options?: WriteFileOptions): Promise<void>;
  /** List entries (files + directories) under a path, up to 2 levels deep.
   *  Returned paths are relative to the listed directory. */
  listDir(path: string): Promise<FileEntry[]>;
  /** Find files matching a glob pattern. */
  glob(pattern: string, path: string): Promise<GlobResult>;
  /** Search file contents with a fixed-string pattern. */
  grep(pattern: string, path: string, include?: string): Promise<GrepResult>;
}

export interface ExecOptions {
  /** Working directory override for this command. Defaults to sandbox's cwd. */
  cwd?: string;
  /** Timeout in milliseconds. Defaults to sandbox's timeoutMs. */
  timeoutMs?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface WriteFileOptions {
  /** Append to existing file instead of overwriting. */
  append?: boolean;
}

export interface FileEntry {
  /** Relative path (relative to the queried directory). */
  path: string;
  is_dir: boolean;
}

export interface GlobResult {
  files: FileEntry[];
  error?: string;
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

export interface GrepResult {
  matches: GrepMatch[];
  error?: string;
}
