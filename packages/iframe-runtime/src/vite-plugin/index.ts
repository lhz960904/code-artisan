import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const RUNTIME_FILE_NAME = "runtime.iife.js";

export interface CodeArtisanRuntimeOptions {
  /** Override the path used to load runtime.iife.js. Defaults to a sibling
   *  of this plugin file (vendored layout). */
  runtimePath?: string;
}

export default function codeArtisanRuntime(
  options: CodeArtisanRuntimeOptions = {},
): Plugin {
  let cachedBundle: string | undefined;

  return {
    name: "code-artisan-runtime",
    apply: "serve",
    transformIndexHtml: {
      order: "pre",
      handler() {
        if (cachedBundle === undefined) {
          const bundlePath =
            options.runtimePath ?? path.resolve(import.meta.dirname, RUNTIME_FILE_NAME);
          cachedBundle = readFileSync(bundlePath, "utf-8");
        }
        return [
          {
            tag: "script",
            children: cachedBundle,
            injectTo: "head-prepend",
          },
        ];
      },
    },
  };
}
