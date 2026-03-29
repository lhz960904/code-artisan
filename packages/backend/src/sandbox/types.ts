/**
 * Abstract sandbox interface, aligned with DeerFlow Sandbox ABC.
 * @see https://github.com/nicepkg/deerflow - sandbox/sandbox.py
 */
export interface Sandbox {
  readonly id: string;

  /** Execute a bash command in the sandbox and return its output. */
  executeCommand(command: string, opts?: { background?: boolean }): Promise<string>;

  /** Read the content of a file. */
  readFile(path: string): Promise<string>;

  /** List the contents of a directory. */
  listDir(path: string, maxDepth?: number): Promise<string[]>;

  /** Write text content to a file. */
  writeFile(path: string, content: string, append?: boolean): Promise<void>;

  /** Get the public URL for a given port. */
  getHostUrl(port: number): string;

  /** Close and destroy the sandbox. */
  close(): Promise<void>;
}
