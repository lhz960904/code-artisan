import { SANDBOX_WORKSPACE_ROOT } from "@code-artisan/shared";
import type { E2BSandbox } from "../../sandbox/e2b-sandbox";
import type { ShellSessionManager } from "../shell-session";
import type { ShellSession } from "../shell-session/session";
import type { Manifest, NormalizedDevCommand } from "./manifest";
import { normalizeDevCommand, readManifest } from "./manifest";
import { clearLockFile, readLockFile, writeLockFile } from "./lock-file";

const DEFAULT_PTY_COLS = 80;
const DEFAULT_PTY_ROWS = 24;

const KILL_PORT_TIMEOUT_MS = 5_000;
// Covers `<install> && <dev>` cold start on a fresh sandbox.
const PORT_PROBE_TIMEOUT_MS = 90_000;

export interface BootstrapDevServerOptions {
  sandbox: E2BSandbox;
  conversationId: string;
  manager: ShellSessionManager;
  cols?: number;
  rows?: number;
}

export interface BootstrapDevServerResult {
  sessionId: string;
  command: string;
  cwd: string;
}

// Caller-guarded; idempotency is `maybeBootstrapDevServer`'s job, not this fn's.
export async function bootstrapDevServer(
  opts: BootstrapDevServerOptions,
): Promise<BootstrapDevServerResult | null> {
  const { sandbox, conversationId, manager, cols = DEFAULT_PTY_COLS, rows = DEFAULT_PTY_ROWS } = opts;
  const tag = `[bootstrap-dev sandbox=${sandbox.sandboxId}]`;
  console.log(`${tag} start (conversation=${conversationId})`);

  const manifest = await readManifest(sandbox);
  if (!manifest) {
    console.log(`${tag} skip: no manifest at .code-artisan/manifest.json`);
    return null;
  }
  const dev = normalizeDevCommand(manifest.scripts?.dev);
  if (!dev) {
    console.log(`${tag} skip: manifest has no scripts.dev`);
    return null;
  }
  console.log(`${tag} dev resolved: command="${dev.command}" port=${dev.port ?? "<none>"} cwd=${dev.cwd ?? "<workspace>"}`);

  const cwd = dev.cwd ?? SANDBOX_WORKSPACE_ROOT;

  await killStalePorts(sandbox, dev.port, tag);

  const bootCommand = buildBootCommand(manifest, dev);
  console.log(`${tag} boot command: ${bootCommand}`);

  const session = await manager.create({
    sandbox,
    conversationId,
    owner: "agent",
    command: bootCommand,
    cwd,
    cols,
    rows,
  });
  console.log(`${tag} session created: id=${session.id} pid=${session.pid}`);

  if (dev.port) {
    void probePortAndExpose({
      sandbox,
      manager,
      conversationId,
      sessionId: session.id,
      port: dev.port,
      command: dev.command,
      timeoutMs: PORT_PROBE_TIMEOUT_MS,
      tag,
    });
  } else {
    console.warn(
      `${tag} manifest.scripts.dev.port not declared — preview won't auto-expose. ` +
        `Agent should call expose_port manually after the server is up.`,
    );
  }

  attachLockClearOnExit(sandbox, session);

  return { sessionId: session.id, command: dev.command, cwd };
}

// Install runs only if explicitly declared — no inference; agent's responsibility.
export function buildBootCommand(manifest: Manifest, dev: NormalizedDevCommand): string {
  const install = manifest.scripts?.install;
  return install ? `${install} && ${dev.command}` : dev.command;
}

async function killStalePorts(
  sandbox: E2BSandbox,
  declaredPort: number | undefined,
  tag: string,
): Promise<void> {
  const ports = new Set<number>();
  const lock = await readLockFile(sandbox);
  if (lock?.port) ports.add(lock.port);
  if (declaredPort) ports.add(declaredPort);
  if (ports.size === 0) {
    console.log(`${tag} kill: no ports to clear (no lock + no declared port)`);
    return;
  }
  console.log(`${tag} kill: clearing ports [${[...ports].join(", ")}]`);

  for (const port of ports) {
    // ss is iproute2 (universal on Debian/Ubuntu). The earlier fuser/lsof ||
    // chain was buggy: an empty `xargs -r kill -9` always exits 0.
    const cmd =
      `bash -c '` +
      `pids=$(ss -lntp 2>/dev/null | grep -E ":${port}[[:space:]]" | sed -nE "s/.*pid=([0-9]+).*/\\1/p" | sort -u | tr "\\n" " "); ` +
      `echo "killing pids on port ${port}: [$pids]"; ` +
      `if [ -n "$pids" ]; then kill -9 $pids 2>/dev/null; sleep 0.5; fi; ` +
      `true` +
      `'`;
    try {
      const result = await sandbox.exec(cmd, { timeoutMs: KILL_PORT_TIMEOUT_MS });
      console.log(`${tag} kill port ${port}: ${result.stdout.trim()}`);
    } catch (err) {
      console.warn(`${tag} kill port ${port} failed:`, err);
    }
  }
}

// Bash `/dev/tcp` builtin — no external tools needed.
async function probePortAndExpose(args: {
  sandbox: E2BSandbox;
  manager: ShellSessionManager;
  conversationId: string;
  sessionId: string;
  port: number;
  command: string;
  timeoutMs: number;
  tag: string;
}): Promise<void> {
  const { sandbox, manager, conversationId, sessionId, port, command, timeoutMs, tag } = args;
  const startedAt = Date.now();
  console.log(`${tag} probe: waiting for port ${port} (timeout ${timeoutMs}ms)`);

  const timeoutSeconds = Math.ceil(timeoutMs / 1000);
  const probeCmd =
    `bash -c '` +
    `end=$(($(date +%s) + ${timeoutSeconds})); ` +
    `while [ $(date +%s) -lt $end ]; do ` +
    `  (echo > /dev/tcp/127.0.0.1/${port}) >/dev/null 2>&1 && exit 0; ` +
    `  sleep 0.5; ` +
    `done; ` +
    `exit 1` +
    `'`;

  try {
    const result = await sandbox.exec(probeCmd, { timeoutMs: timeoutMs + 5_000 });
    const elapsed = Date.now() - startedAt;
    if (result.exitCode !== 0) {
      console.warn(`${tag} probe: port ${port} did not come up after ${elapsed}ms`);
      return;
    }
    console.log(`${tag} probe: port ${port} ready after ${elapsed}ms`);

    const host = await sandbox.sdk.getHost(port);
    const url = `https://${host}`;
    manager.setPreview(sandbox.sandboxId, conversationId, { url, port, sessionId });
    await writeLockFile(sandbox, { port, sessionId, command, ts: Date.now() });
    console.log(`${tag} preview exposed: ${url}`);
  } catch (err) {
    console.error(`${tag} probe failed:`, err);
  }
}

function attachLockClearOnExit(sandbox: E2BSandbox, session: ShellSession): void {
  const unsubscribe = session.subscribe((event) => {
    if (event.kind !== "exit") return;
    unsubscribe();
    void clearLockFile(sandbox).catch((err) => {
      console.warn(`[bootstrap-dev] clearLockFile on exit failed:`, err);
    });
  });
}

// Mark-on-success only: null returns and throws stay retriable.
const bootstrappedSandboxes = new Set<string>();
const inflightBootstraps = new Map<string, Promise<BootstrapDevServerResult | null>>();

export async function maybeBootstrapDevServer(
  opts: BootstrapDevServerOptions,
): Promise<BootstrapDevServerResult | null> {
  return memoizedBootstrap(opts.sandbox.sandboxId, () => bootstrapDevServer(opts));
}

/** Pure memoization layer — exported only so tests can inject a fake
 *  bootstrapper without spinning up a real sandbox. */
export async function memoizedBootstrap(
  sandboxId: string,
  fn: () => Promise<BootstrapDevServerResult | null>,
): Promise<BootstrapDevServerResult | null> {
  if (bootstrappedSandboxes.has(sandboxId)) {
    console.log(`[bootstrap-dev sandbox=${sandboxId}] short-circuit: already bootstrapped this process`);
    return null;
  }

  const inflight = inflightBootstraps.get(sandboxId);
  if (inflight) {
    console.log(`[bootstrap-dev sandbox=${sandboxId}] dedupe: joining in-flight bootstrap`);
    return inflight;
  }

  const promise = (async () => {
    try {
      const result = await fn();
      if (result) bootstrappedSandboxes.add(sandboxId);
      return result;
    } finally {
      inflightBootstraps.delete(sandboxId);
    }
  })();
  inflightBootstraps.set(sandboxId, promise);
  return promise;
}

export function __resetBootstrapStateForTest(): void {
  bootstrappedSandboxes.clear();
  inflightBootstraps.clear();
}
