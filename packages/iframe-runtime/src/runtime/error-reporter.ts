import type { BrowserError } from "@code-artisan/shared";
import type { MessageBus } from "./message-bus";

const CONSOLE_ERROR_KEYWORDS = [
  "Warning:",
  "Error:",
  "React",
  "Hook",
  "Hydration",
  "Cannot read",
  "is not a function",
  "is not defined",
];

const MAX_MESSAGE_LENGTH = 2000;

function truncate(text: string): string {
  if (text.length <= MAX_MESSAGE_LENGTH) return text;
  return text.slice(0, MAX_MESSAGE_LENGTH) + "... [truncated]";
}

function stringifyArg(arg: unknown): string {
  if (arg instanceof Error) return arg.stack ?? arg.message;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export function setupErrorReporter(bus: MessageBus): void {
  window.addEventListener("error", (event) => {
    const error = event.error;
    const payload: BrowserError = {
      source: "window.error",
      message: truncate(event.message || String(error ?? "Unknown error")),
      stack: error?.stack ? truncate(error.stack) : undefined,
      filename: event.filename || undefined,
      line: event.lineno || undefined,
      column: event.colno || undefined,
      timestamp: Date.now(),
    };
    bus.send({ type: "error", payload });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { message?: string; stack?: string } | string | undefined;
    const message =
      typeof reason === "string"
        ? reason
        : reason?.message ?? String(reason ?? "Unhandled promise rejection");
    const stack = typeof reason === "object" ? reason?.stack : undefined;
    const payload: BrowserError = {
      source: "unhandledrejection",
      message: truncate(message),
      stack: stack ? truncate(stack) : undefined,
      timestamp: Date.now(),
    };
    bus.send({ type: "error", payload });
  });

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);
    const text = args.map(stringifyArg).join(" ");
    if (!CONSOLE_ERROR_KEYWORDS.some((keyword) => text.includes(keyword))) {
      return;
    }
    const payload: BrowserError = {
      source: "console.error",
      message: truncate(text),
      timestamp: Date.now(),
    };
    bus.send({ type: "error", payload });
  };
}
