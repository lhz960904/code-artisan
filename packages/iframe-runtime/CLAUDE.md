# @code-artisan/iframe-runtime

Build-time-only package. Produces two artifacts that vendor into skill templates and ride along with every sandbox image: a browser **runtime IIFE** that lives inside the user's preview iframe, and a **Vite plugin** that injects that runtime into the user's `index.html` at HTTP-response time. No backend involvement — once the plugin is in `vite.config.ts`, every `transformIndexHtml` call inserts the runtime as the first script in `<head>`.

This package solves the cross-origin observability gap: the preview iframe is on `*.e2b.app`, the parent app is on `code-artisan.app`. Without a script *inside* the iframe, the parent has no way to see runtime errors or capture clicks. We chose Vite-plugin injection (Sandpack-style) over backend disk-write injection because the latter has a structural race condition (iframe loads before file write completes).

## Structure

```text
src/
  runtime/                 The IIFE that runs in the user's preview iframe
    entry.ts                 Idempotent `window.__caIframeRuntime` flag, wires up bus + reporter,
                               sends `ready` after DOMContentLoaded
    message-bus.ts           Tiny brand-tagged postMessage wrapper. send() auto-fills `brand`,
                               on() filters incoming parent → iframe messages by allowed types
    error-reporter.ts        window.error + unhandledrejection + console.error (whitelist-filtered)
                               → bus.send({type:"error", payload: BrowserError})
  vite-plugin/
    index.ts                 Default export `codeArtisanRuntime()` — Vite Plugin with
                               `apply: "serve"` (dev only, prod build stays clean) +
                               `transformIndexHtml` order:"pre" injecting the runtime IIFE as
                               `<script>` into `head-prepend`. Reads runtime.iife.js sibling
                               file via `import.meta.dirname` (works after vendoring).
scripts/
  vendor.ts                  Post-build copy: dist/{runtime.iife.js, vite-plugin.js} →
                               sandbox-template/skills/hono-fullstack/template/.code-artisan/
                               (and any future template targets)
dist/                        Build outputs (gitignored)
  runtime.iife.js              Browser IIFE, target=browser, format=iife, minified
  vite-plugin.js               Node ESM, target=node, format=esm, vite externalised
```

## Build pipeline

`pnpm build`:
1. `build:runtime` — `bun build src/runtime/entry.ts --target=browser --format=iife --minify`
2. `build:plugin` — `bun build src/vite-plugin/index.ts --target=node --format=esm --external vite`
3. `vendor` — `bun scripts/vendor.ts` copies both artifacts into the skill template's `.code-artisan/` directory

`pnpm dev` runs both `bun build --watch` invocations in parallel via concurrently — but note the sandbox image is a **separate build artefact** (`pnpm sandbox:build`), so a watch-rebuilt runtime won't reach a running sandbox until the image is re-published *and* a new conversation creates a fresh sandbox.

`pnpm sandbox:build` (root script) auto-runs this package's build first, so vendored artifacts are always fresh before the e2b CLI uploads `sandbox-template/`.

## Conventions

- **Runtime is framework-agnostic** — pure DOM + browser APIs (`window.error`, `addEventListener`, `postMessage`, `document.elementFromPoint`). No React, no JSX, no framework dependencies. It runs inside *the user's* app, which could be React/Vue/Svelte/vanilla.
- **Vite plugin only injects in `serve` mode** — `apply: "serve"` keeps `vite build` output clean so users can export the project to GitHub and ship it without the platform runtime.
- **Idempotent init** — `window.__caIframeRuntime` flag prevents double-registration on HMR full reloads.
- **Origin / source / brand triple filter on the parent side** — runtime sends with a unique `brand: "ca:iframe-bridge:v1"` so parent's listener (`useIframeBridge`) can distinguish our messages from third-party noise (HMR, devtools, ad SDKs).
- **Distributive `Omit` typing in MessageBus** — `Omit<IframeToParentMessage, "brand">` collapses the discriminated union; use `T extends unknown ? Omit<T, "brand"> : never` to preserve per-variant `payload` shapes.
- **Vendor target lives in this repo, not in user-land** — the AI's project gets a copy of `.code-artisan/` (vendored at sandbox-image build time), but it's marked don't-touch by the system prompt's PROJECT_CONVENTIONS section. Users editing `vite.config.ts` are expected to leave the `codeArtisanRuntime()` plugin and `.code-artisan/` import path alone.
- **Package exports are products, not source** — `./runtime-bundle` and `./vite-plugin` map to `dist/*.js`. Source `.ts` is private; consumers always go through built artifacts.

## Tech

Bun (build + scripts) · TypeScript 5 · Vite 6 (peer-dep, externalised in plugin bundle) · `@code-artisan/shared` (workspace, source for protocol types)

## Relationship

Source-of-truth for the cross-iframe wire protocol lives in `@code-artisan/shared/iframe-protocol` (`IFRAME_BRIDGE_BRAND`, `BrowserError`, `SelectedElement`, `IframeToParentMessage`, `ParentToIframeMessage`, `isIframeBridgeMessage`). This package's runtime imports those types and produces messages matching them; `@code-artisan/frontend`'s `useIframeBridge` hook consumes the same types on the parent side. The triangle is: shared owns the protocol, iframe-runtime owns the producer (in-iframe), frontend owns the consumer (in-parent).

Backend has no role — no injection, no buffer, no agent tool. Errors flow purely through the browser-side message bus → frontend store → user-triggered `setPendingChatMessage` → existing chat send path. Future enhancements (element picker source-loc, Vite compile-error overlay capture) extend the runtime + protocol but stay browser-side.
