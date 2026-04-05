/**
 * Abstract sandbox interface.
 * Concrete implementations (local, E2B, etc.) are provided by the application.
 */
export interface Sandbox {
  readonly id: string;
  exec(command: string, options?: ExecOptions): Promise<string>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string, options?: WriteFileOptions): Promise<void>;
  listDir(path: string): Promise<string[]>;
  glob(pattern: string, path: string): Promise<GlobResult>;
  grep(pattern: string, path: string, include?: string): Promise<GrepResult>;
  close(): Promise<void>;
}

export interface GlobFileInfo {
  path: string;
  is_dir: boolean;
}

export interface GlobResult {
  files: GlobFileInfo[];
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

export interface ExecOptions {
  background?: boolean;
}

export interface WriteFileOptions {
  append?: boolean;
}
