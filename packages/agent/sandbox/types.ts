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
  /** Start a long-running process and return a handle. The process keeps running
   *  until it exits on its own or the caller calls `kill()`. */
  spawn(command: string, options?: SpawnOptions): Promise<ProcessHandle>;
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

export interface SpawnOptions {
  /** Working directory override for this command. Defaults to sandbox's cwd. */
  cwd?: string;
}

export interface ProcessHandle {
  readonly pid: number;
  /** Yields stdout chunks as decoded strings. Completes when the process exits. */
  readonly stdout: AsyncIterable<string>;
  /** Yields stderr chunks as decoded strings. Completes when the process exits. */
  readonly stderr: AsyncIterable<string>;
  /** Resolves with the exit code once the process terminates. */
  wait(): Promise<number>;
  /** Non-blocking liveness check. */
  isAlive(): boolean;
  /** Terminate the process. Defaults to SIGTERM. */
  kill(signal?: "SIGTERM" | "SIGKILL"): Promise<void>;
  /** Map a port inside the sandbox to a public URL. Only meaningful for
   *  remote sandboxes (E2B). Local sandboxes should throw. */
  exposePort(port: number): Promise<string>;
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
