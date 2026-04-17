# Marketing Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Miro-inspired Marketing Landing at `/` (public) with route auth-gate redirect for logged-in users, installing the frontend rewrite's shared visual tokens and font stack along the way.

**Architecture:** In-place rewrite on `main`. Redefine shadcn HSL tokens to Miro-aligned values in `src/index.css` so existing components inherit the new look automatically; add new pastel decorative CSS vars; install Geist + Noto Sans + JetBrains Mono via `@fontsource`. Marketing components live under `src/components/marketing/` and are composed by a new `MarketingLanding` route component. The `/` route gains `beforeLoad` that redirects authed users to `/dashboard`.

**Tech Stack:** Vite 6 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · TanStack Router · Zustand · better-auth · lucide-react · @fontsource · Playwright MCP (verification).

**Spec reference:** `docs/superpowers/specs/2026-04-17-marketing-landing-design.md`

---

## File Structure

### Created

| Path | Responsibility | Target lines |
|---|---|---|
| `packages/frontend/src/components/common/theme-toggle.tsx` | Cycle light → dark → system via existing `useTheme()` | ≤ 50 |
| `packages/frontend/src/components/marketing/marketing-landing.tsx` | Route component; composes all sections | ≤ 40 |
| `packages/frontend/src/components/marketing/marketing-layout.tsx` | Page shell: nav + main + footer | ≤ 30 |
| `packages/frontend/src/components/marketing/marketing-nav.tsx` | Sticky nav with scroll shadow | ≤ 80 |
| `packages/frontend/src/components/marketing/marketing-footer.tsx` | Minimal footer | ≤ 40 |
| `packages/frontend/src/components/marketing/hero-section.tsx` | Headline + sub + prompt preview wrapper | ≤ 60 |
| `packages/frontend/src/components/marketing/prompt-preview.tsx` | Prompt textarea + chips + Blue CTA | ≤ 90 |
| `packages/frontend/src/components/marketing/how-it-works.tsx` | 3-step horizontal | ≤ 70 |
| `packages/frontend/src/components/marketing/live-demo.tsx` | Static mock loop | ≤ 110 |
| `packages/frontend/src/components/marketing/feature-tile.tsx` | Single bento tile | ≤ 50 |
| `packages/frontend/src/components/marketing/feature-bento.tsx` | 6-tile bento grid | ≤ 70 |

### Modified

| Path | Change |
|---|---|
| `packages/frontend/package.json` | Add `@fontsource/*` deps |
| `packages/frontend/src/index.css` | Redefine shadcn HSL tokens to Miro, add pastels + surface-elevated + font families + font class utilities |
| `packages/frontend/src/contexts/theme-context.tsx` | Default from `"dark"` → `"system"` |
| `packages/frontend/src/pages/home.tsx` | Remove inline `HomePage`; add `beforeLoad` auth redirect; render `<MarketingLanding>` |

---

## Testing strategy

The frontend package has no unit test runner configured. Given the target is visual/UI work, verification uses:

1. **Build + lint** after each logical batch: `pnpm --filter @code-artisan/frontend build` and `pnpm --filter @code-artisan/frontend lint`
2. **Dev server** in background: `pnpm --filter @code-artisan/frontend dev` (Vite serves at `http://localhost:5173`)
3. **Playwright MCP** for visual verification after each section is added — navigate, take screenshot, inspect snapshot
4. **Theme cycling** verified in both light + dark per relevant tasks

No unit tests are added in this sub-project. A Vitest setup is deferred as a future task in the rewrite roadmap.

---

## Task 1: Install fonts, redefine tokens, swap theme default

**Files:**
- Modify: `packages/frontend/package.json`
- Modify: `packages/frontend/src/index.css`
- Modify: `packages/frontend/src/contexts/theme-context.tsx`

- [ ] **Step 1: Install font packages**

Run from repo root:

```bash
pnpm --filter @code-artisan/frontend add @fontsource/geist-sans @fontsource/noto-sans @fontsource/jetbrains-mono
```

Expected: adds three entries under `packages/frontend/package.json` `dependencies` and updates `pnpm-lock.yaml`. Exit code 0.

- [ ] **Step 2: Replace `packages/frontend/src/index.css` contents**

Overwrite the file with:

```css
@import "tailwindcss";

/* Self-hosted fonts (order matters: family files, then Tailwind) */
@import "@fontsource/geist-sans/400.css";
@import "@fontsource/geist-sans/500.css";
@import "@fontsource/geist-sans/600.css";
@import "@fontsource/geist-sans/500-italic.css";
@import "@fontsource/noto-sans/400.css";
@import "@fontsource/noto-sans/500.css";
@import "@fontsource/noto-sans/600.css";
@import "@fontsource/jetbrains-mono/400.css";
@import "@fontsource/jetbrains-mono/500.css";

/*
 * CodeArtisan Theme System — Miro-aligned tokens
 * shadcn/ui CSS-variable convention with Tailwind v4 @theme
 */

@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-success: hsl(var(--success));
  --color-success-foreground: hsl(var(--success-foreground));
  --color-warning: hsl(var(--warning));
  --color-warning-foreground: hsl(var(--warning-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  --color-sidebar: hsl(var(--sidebar));
  --color-sidebar-foreground: hsl(var(--sidebar-foreground));
  --color-sidebar-border: hsl(var(--sidebar-border));

  --color-pastel-coral: var(--pastel-coral);
  --color-pastel-teal: var(--pastel-teal);
  --color-pastel-orange: var(--pastel-orange);
  --color-pastel-yellow: var(--pastel-yellow);
  --color-pastel-pink: var(--pastel-pink);
  --color-pastel-moss: var(--pastel-moss);
  --color-surface-elevated: var(--surface-elevated);

  --font-display: "Geist", system-ui, -apple-system, sans-serif;
  --font-body: "Noto Sans", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, Menlo, monospace;

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

/* Light theme (Miro) */
:root {
  --background: 0 0% 100%;
  --foreground: 240 4% 11%;
  --card: 0 0% 100%;
  --card-foreground: 240 4% 11%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 4% 11%;
  --primary: 231 99% 68%;
  --primary-foreground: 0 0% 100%;
  --secondary: 225 14% 97%;
  --secondary-foreground: 225 10% 37%;
  --muted: 225 14% 97%;
  --muted-foreground: 225 10% 37%;
  --accent: 225 14% 97%;
  --accent-foreground: 240 4% 11%;
  --destructive: 9 68% 54%;
  --destructive-foreground: 0 0% 100%;
  --success: 155 100% 35%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 50%;
  --warning-foreground: 0 0% 100%;
  --border: 225 14% 90%;
  --input: 225 14% 90%;
  --ring: 231 99% 68%;
  --radius: 0.75rem;
  --sidebar: 0 0% 100%;
  --sidebar-foreground: 240 4% 11%;
  --sidebar-border: 225 14% 90%;
  --pastel-coral: #ffc6c6;
  --pastel-teal: #c3faf5;
  --pastel-orange: #ffe6cd;
  --pastel-yellow: #fff4c2;
  --pastel-pink: #fde0f0;
  --pastel-moss: #d6ecdd;
  --surface-elevated: #fafbfc;
}

/* Dark theme — workspace elevated */
.dark {
  --background: 220 10% 5%;
  --foreground: 240 7% 92%;
  --card: 220 8% 9%;
  --card-foreground: 240 7% 92%;
  --popover: 220 8% 9%;
  --popover-foreground: 240 7% 92%;
  --primary: 231 100% 74%;
  --primary-foreground: 220 10% 5%;
  --secondary: 220 7% 11%;
  --secondary-foreground: 223 12% 66%;
  --muted: 220 7% 11%;
  --muted-foreground: 223 12% 66%;
  --accent: 220 7% 11%;
  --accent-foreground: 240 7% 92%;
  --destructive: 9 100% 66%;
  --destructive-foreground: 0 0% 100%;
  --success: 155 100% 39%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 50%;
  --warning-foreground: 0 0% 100%;
  --border: 220 6% 16%;
  --input: 220 6% 16%;
  --ring: 231 100% 74%;
  --sidebar: 220 8% 9%;
  --sidebar-foreground: 240 7% 92%;
  --sidebar-border: 220 6% 16%;
  --pastel-coral: rgba(255, 160, 140, 0.14);
  --pastel-teal: rgba(0, 200, 190, 0.12);
  --pastel-orange: rgba(255, 170, 90, 0.12);
  --pastel-yellow: rgba(235, 200, 90, 0.12);
  --pastel-pink: rgba(255, 140, 210, 0.12);
  --pastel-moss: rgba(100, 180, 120, 0.12);
  --surface-elevated: #1a1d22;
}

@layer base {
  * {
    border-color: hsl(var(--border));
  }
  html {
    scroll-behavior: smooth;
  }
  body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    font-family: var(--font-body);
    font-feature-settings: "ss01", "ss04", "ss05";
  }
  .font-display {
    font-family: var(--font-display);
    font-feature-settings: "cv03", "cv04", "cv09", "cv11";
  }
  .font-mono {
    font-family: var(--font-mono);
  }

  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: hsl(var(--muted-foreground) / 0.3);
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--muted-foreground) / 0.5);
  }
}
```

- [ ] **Step 3: Switch ThemeProvider default**

Edit `packages/frontend/src/contexts/theme-context.tsx`. Locate:

```tsx
    return (stored as Theme) || "dark";
```

Replace with:

```tsx
    return (stored as Theme) || "system";
```

Nothing else in the file changes.

- [ ] **Step 4: Verify build**

```bash
pnpm --filter @code-artisan/frontend build
```

Expected: `vite build` prints `built in ...` and exit 0. No unresolved `@fontsource/*` imports. Warnings about chunk size are acceptable.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/package.json packages/frontend/pnpm-lock.yaml pnpm-lock.yaml packages/frontend/src/index.css packages/frontend/src/contexts/theme-context.tsx
git commit -m "feat(frontend): install Miro tokens + Geist/Noto fonts + system theme default

Redefine shadcn HSL tokens to Miro-aligned values, add pastel decorative
CSS vars, self-host Geist/Noto Sans/JetBrains Mono via @fontsource, and
switch ThemeProvider default to 'system' so new users respect OS preference.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Note: `pnpm-lock.yaml` path may live at repo root (pnpm workspace); include whichever `git status` surfaces.

---

## Task 2: Shared `ThemeToggle` component

**Files:**
- Create: `packages/frontend/src/components/common/theme-toggle.tsx`

- [ ] **Step 1: Create the component**

Write `packages/frontend/src/components/common/theme-toggle.tsx`:

```tsx
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/theme-context";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = `Theme: ${theme}. Click to switch to ${next}.`;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={label}
      title={label}
    >
      <Icon className="size-4" />
    </button>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm --filter @code-artisan/frontend build
```

Expected: builds successfully (no import errors). New file is emitted into `dist`.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/common/theme-toggle.tsx
git commit -m "feat(frontend): shared ThemeToggle cycling light/dark/system

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Marketing shell — Layout, Nav, Footer, Landing scaffold

**Files:**
- Create: `packages/frontend/src/components/marketing/marketing-layout.tsx`
- Create: `packages/frontend/src/components/marketing/marketing-nav.tsx`
- Create: `packages/frontend/src/components/marketing/marketing-footer.tsx`
- Create: `packages/frontend/src/components/marketing/marketing-landing.tsx`

- [ ] **Step 1: Create `marketing-layout.tsx`**

```tsx
import type { ReactNode } from "react";
import { MarketingNav } from "./marketing-nav";
import { MarketingFooter } from "./marketing-footer";

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
```

- [ ] **Step 2: Create `marketing-nav.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Github } from "lucide-react";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { cn } from "@/lib/utils";

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={cn(
        "sticky top-0 z-50 flex h-14 items-center gap-6 px-6 transition-[background-color,box-shadow] duration-150",
        scrolled
          ? "bg-background/80 backdrop-blur shadow-[0_1px_0_0_hsl(var(--border))]"
          : "bg-transparent",
      )}
    >
      <Link to="/" className="flex items-center gap-2 font-display text-base font-semibold">
        <span className="size-5 rounded-md bg-primary" aria-hidden />
        <span>CodeArtisan</span>
      </Link>
      <div className="hidden gap-5 font-display text-sm text-muted-foreground md:flex">
        <a href="#how" className="transition-colors hover:text-foreground">
          How it works
        </a>
        <a href="#demo" className="transition-colors hover:text-foreground">
          Live demo
        </a>
        <a href="#features" className="transition-colors hover:text-foreground">
          Features
        </a>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <a
          href="https://github.com/lhz960904/code-artisan"
          target="_blank"
          rel="noreferrer"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="GitHub repository"
        >
          <Github className="size-4" />
        </a>
        <ThemeToggle />
        <Link
          to="/login"
          className="ml-1 inline-flex h-8 items-center rounded-md bg-primary px-3 font-display text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Log in
        </Link>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Create `marketing-footer.tsx`**

```tsx
export function MarketingFooter() {
  return (
    <footer className="border-t border-border px-6 py-10 text-center text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 md:flex-row md:justify-between">
        <div>© 2026 CodeArtisan · crafted for builders.</div>
        <div className="flex gap-4">
          <a href="https://github.com/lhz960904/code-artisan" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
            GitHub
          </a>
          <a href="#" className="transition-colors hover:text-foreground">
            Twitter
          </a>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Create `marketing-landing.tsx` (scaffold only — sections arrive in later tasks)**

```tsx
import { MarketingLayout } from "./marketing-layout";

export function MarketingLanding() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-5xl px-6 py-32 text-center">
        <p className="font-display text-2xl">Marketing Landing scaffold</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Sections (Hero / HowItWorks / LiveDemo / FeatureBento) land in following tasks.
        </p>
      </section>
    </MarketingLayout>
  );
}
```

- [ ] **Step 5: Verify build**

```bash
pnpm --filter @code-artisan/frontend build
```

Expected: build succeeds with all four new files emitted.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/marketing/
git commit -m "feat(frontend): marketing shell (layout/nav/footer) + landing scaffold

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Rewire `/` route — Marketing for unauthed, redirect to /dashboard for authed

**Files:**
- Modify: `packages/frontend/src/pages/home.tsx`

- [ ] **Step 1: Rewrite `home.tsx` entirely**

Replace the file contents with:

```tsx
import { createRoute, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth-client";
import { MarketingLanding } from "@/components/marketing/marketing-landing";
import { rootRoute } from "./layout/root";

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const { data } = await getSession();
    if (data?.session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: MarketingLanding,
});
```

Notes:
- `HomePage` (the old inline prompt entry) is removed. Its role moves to sub-project 2 (Dashboard).
- `useConversationCreate` import is no longer needed here — do not keep it.

- [ ] **Step 2: Start the dev server (background) and navigate**

Run the dev server in the background:

```bash
pnpm --filter @code-artisan/frontend dev
```

Expected output (within ~3s): `VITE vX ready in ... Local: http://localhost:5173/`. Keep this process running for subsequent tasks; do not stop it until the end of the plan.

- [ ] **Step 3: Playwright MCP — verify Marketing shell renders for unauthed**

Using Playwright MCP:

1. `browser_navigate` → `http://localhost:5173/`
2. `browser_take_screenshot` → confirm the nav bar + "Marketing Landing scaffold" placeholder are visible. The background should be near-white (light theme on fresh install because no localStorage entry exists yet and default is `system`; if the OS is dark, expect dark palette).
3. `browser_snapshot` → confirm DOM has `<nav>` with "CodeArtisan", anchor links "How it works / Live demo / Features", and a "Log in" link.

If an authed user is already signed in (GitHub session exists), expected result is a redirect to `/dashboard`; in that case, sign out via devtools (`document.cookie` clear) or use a fresh Playwright context, then re-verify.

- [ ] **Step 4: Verify build**

```bash
pnpm --filter @code-artisan/frontend build
```

Expected: clean build, no lint/type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/pages/home.tsx
git commit -m "feat(frontend): rewire / to Marketing Landing with authed-user redirect

Authenticated users at / redirect to /dashboard; unauthenticated users see
the marketing landing. Old HomePage prompt entry is removed (moves into the
dashboard sub-project).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Hero section + Prompt Preview

**Files:**
- Create: `packages/frontend/src/components/marketing/prompt-preview.tsx`
- Create: `packages/frontend/src/components/marketing/hero-section.tsx`
- Modify: `packages/frontend/src/components/marketing/marketing-landing.tsx`

- [ ] **Step 1: Create `prompt-preview.tsx`**

```tsx
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Paperclip, Settings2, Sparkles } from "lucide-react";
import { getSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "A landing page for a coffee startup — hero, pricing, dark mode…";
const STORAGE_KEY = "code-artisan.initialPrompt";

export function PromptPreview() {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleStart() {
    if (busy) return;
    setBusy(true);
    const prompt = value.trim();
    if (prompt) sessionStorage.setItem(STORAGE_KEY, prompt);
    const { data } = await getSession();
    if (data?.session) {
      await navigate({ to: "/dashboard" });
    } else {
      await navigate({ to: "/login", search: { redirect: "/dashboard" } });
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto w-full max-w-[640px] rounded-[20px] bg-card p-4 shadow-[0_0_0_1px_hsl(var(--border))]">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleStart();
          }
        }}
        placeholder={PLACEHOLDER}
        rows={3}
        className="w-full resize-none border-0 bg-transparent px-1 py-1 font-body text-[15px] leading-[1.55] text-foreground outline-none placeholder:text-muted-foreground"
      />
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex flex-wrap gap-2 font-display text-xs">
          <Chip pastel="coral" icon={<Paperclip className="size-3" />}>Attach</Chip>
          <Chip pastel="teal" icon={<Sparkles className="size-3" />}>Agent</Chip>
          <Chip pastel="orange" icon={<Settings2 className="size-3" />}>Opus 4.7</Chip>
        </div>
        <button
          type="button"
          onClick={handleStart}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-display text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Starting…" : <>Start <ArrowRight className="size-4" /></>}
        </button>
      </div>
    </div>
  );
}

type PastelKey = "coral" | "teal" | "orange" | "yellow" | "pink" | "moss";

function Chip({
  pastel,
  icon,
  children,
}: {
  pastel: PastelKey;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const bgClass: Record<PastelKey, string> = {
    coral: "bg-[var(--pastel-coral)]",
    teal: "bg-[var(--pastel-teal)]",
    orange: "bg-[var(--pastel-orange)]",
    yellow: "bg-[var(--pastel-yellow)]",
    pink: "bg-[var(--pastel-pink)]",
    moss: "bg-[var(--pastel-moss)]",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-foreground", bgClass[pastel])}>
      {icon}
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Create `hero-section.tsx`**

```tsx
import { PromptPreview } from "./prompt-preview";

export function HeroSection() {
  return (
    <section className="relative mx-auto max-w-[720px] px-6 pb-16 pt-24 text-center md:pt-32">
      <div className="motion-safe:animate-[fadeIn_0.5s_ease-out_both] inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 font-display text-xs text-muted-foreground shadow-[0_0_0_1px_hsl(var(--border))]">
        <span className="size-1.5 rounded-full bg-success" aria-hidden />
        Opus 4.7 · streaming · live sandbox
      </div>

      <h1 className="motion-safe:animate-[fadeIn_0.6s_ease-out_0.05s_both] mt-6 font-display text-[40px] font-medium leading-[1.05] tracking-[-0.033em] text-foreground md:text-[56px] md:tracking-[-0.033em]">
        Build software by{" "}
        <em className="font-medium italic text-primary">describing it.</em>
      </h1>

      <p className="motion-safe:animate-[fadeIn_0.6s_ease-out_0.1s_both] mx-auto mt-4 max-w-[520px] font-body text-[16px] leading-[1.5] text-muted-foreground md:text-[18px]">
        CodeArtisan pairs with you inside a real sandbox — file tree, terminal, preview — reacting to every prompt.
      </p>

      <div className="motion-safe:animate-[fadeIn_0.6s_ease-out_0.15s_both] mt-10">
        <PromptPreview />
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
```

- [ ] **Step 3: Wire Hero into `marketing-landing.tsx`**

Replace file with:

```tsx
import { MarketingLayout } from "./marketing-layout";
import { HeroSection } from "./hero-section";

export function MarketingLanding() {
  return (
    <MarketingLayout>
      <HeroSection />
    </MarketingLayout>
  );
}
```

- [ ] **Step 4: Playwright MCP — visual verification**

1. `browser_navigate` → `http://localhost:5173/` (Vite HMR already reloaded)
2. `browser_take_screenshot` → confirm: centered "Build software by _describing it._" with italic Blue 450 word; prompt preview card visible with three pastel chips and Blue "Start →" CTA
3. `browser_evaluate` → `document.documentElement.classList.add('dark'); document.documentElement.classList.remove('light');` to force dark
4. `browser_take_screenshot` → confirm dark palette: near-black bg, lighter chips, white text
5. `browser_evaluate` → `document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light');` to restore light
6. `browser_click` on the "Start →" button (no prompt typed). Expected: navigation to `/login?redirect=%2Fdashboard`. Confirm with `browser_snapshot` the login page form is present, then `browser_navigate` back to `http://localhost:5173/` to continue subsequent tasks.
7. `browser_console_messages` → assert no error-level entries surfaced during the round trip.

- [ ] **Step 5: Verify build**

```bash
pnpm --filter @code-artisan/frontend build
```

Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/marketing/prompt-preview.tsx packages/frontend/src/components/marketing/hero-section.tsx packages/frontend/src/components/marketing/marketing-landing.tsx
git commit -m "feat(frontend): marketing Hero + PromptPreview with pastel chips

Hero: Miro headline, italic Blue 450 emphasis word, fade-in stagger.
PromptPreview: textarea + 3 pastel chips + Blue CTA; persists draft into
sessionStorage before routing (authed → /dashboard, else → /login with
redirect).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: How It Works section

**Files:**
- Create: `packages/frontend/src/components/marketing/how-it-works.tsx`
- Modify: `packages/frontend/src/components/marketing/marketing-landing.tsx`

- [ ] **Step 1: Create `how-it-works.tsx`**

```tsx
import { Pencil, Sparkles, Eye } from "lucide-react";
import type { ReactNode } from "react";

type Step = { num: string; title: string; body: string; icon: ReactNode; pastel: string };

const STEPS: Step[] = [
  { num: "01", title: "Describe", body: "Tell CodeArtisan what you want to build — in plain words.", icon: <Pencil className="size-4" />, pastel: "var(--pastel-coral)" },
  { num: "02", title: "Agent builds", body: "It scaffolds files, runs tools, and edits until your spec is real.", icon: <Sparkles className="size-4" />, pastel: "var(--pastel-teal)" },
  { num: "03", title: "Live preview", body: "See the result update in the sandbox as each file changes.", icon: <Eye className="size-4" />, pastel: "var(--pastel-orange)" },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-10 text-center">
        <p className="font-display text-xs uppercase tracking-[0.08em] text-muted-foreground">How it works</p>
        <h2 className="mt-2 font-display text-[32px] font-medium leading-[1.1] tracking-[-0.02em] md:text-[40px]">
          Three moves, one loop.
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <article
            key={s.num}
            className="rounded-2xl bg-card p-8 shadow-[0_0_0_1px_hsl(var(--border))]"
          >
            <div className="flex items-center gap-3">
              <span
                className="inline-flex size-8 items-center justify-center rounded-lg font-display text-xs font-semibold text-foreground"
                style={{ background: s.pastel }}
              >
                {s.icon}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{s.num}</span>
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">{s.title}</h3>
            <p className="mt-1.5 font-body text-sm leading-[1.55] text-muted-foreground">{s.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add to landing**

Update `marketing-landing.tsx`:

```tsx
import { MarketingLayout } from "./marketing-layout";
import { HeroSection } from "./hero-section";
import { HowItWorks } from "./how-it-works";

export function MarketingLanding() {
  return (
    <MarketingLayout>
      <HeroSection />
      <HowItWorks />
    </MarketingLayout>
  );
}
```

- [ ] **Step 3: Playwright MCP — verify section**

1. `browser_navigate` → `http://localhost:5173/`
2. `browser_evaluate` → `document.querySelector('#how')?.scrollIntoView({behavior: 'instant'})`
3. `browser_take_screenshot` → confirm 3 cards in a horizontal grid, each with pastel icon tile + number + title + body. Nav anchor "How it works" should scroll to this section.
4. Click nav anchor "How it works" in the nav — verify smooth scroll.

- [ ] **Step 4: Verify build**

```bash
pnpm --filter @code-artisan/frontend build
```

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/marketing/how-it-works.tsx packages/frontend/src/components/marketing/marketing-landing.tsx
git commit -m "feat(frontend): marketing HowItWorks three-step section

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Live Demo section (static mock loop)

**Files:**
- Create: `packages/frontend/src/components/marketing/live-demo.tsx`
- Modify: `packages/frontend/src/components/marketing/marketing-landing.tsx`

- [ ] **Step 1: Create `live-demo.tsx`**

```tsx
export function LiveDemo() {
  return (
    <section id="demo" className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-10 text-center">
        <p className="font-display text-xs uppercase tracking-[0.08em] text-muted-foreground">Live demo</p>
        <h2 className="mt-2 font-display text-[32px] font-medium leading-[1.1] tracking-[-0.02em] md:text-[40px]">
          Watch the loop happen.
        </h2>
      </div>

      <div className="mx-auto grid max-w-[880px] grid-cols-[1.1fr_1fr] overflow-hidden rounded-[24px] bg-card shadow-[0_0_0_1px_hsl(var(--border))] motion-safe:[&_.demo-loop]:animate-[demoLoop_8s_ease-in-out_infinite]">
        {/* Chat column */}
        <div className="border-r border-border p-5">
          <p className="mb-3 font-display text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Chat</p>
          <div className="rounded-xl bg-muted px-3 py-2 font-body text-sm demo-loop" style={{ animationDelay: "0s" }}>
            Build me a five-in-a-row game
          </div>
          <div
            className="mt-3 rounded-xl bg-primary/10 p-3 font-body text-sm text-foreground demo-loop"
            style={{ animationDelay: "0.5s" }}
          >
            <p className="mb-2 font-display text-xs font-semibold">⌄ Made some changes <span className="ml-1 font-mono text-[10px] text-muted-foreground">v1</span></p>
            <ul className="space-y-1.5 font-body text-xs text-muted-foreground">
              <li>
                <span className="mr-2 inline-block rounded-[4px] bg-[var(--pastel-coral)] px-1.5 py-[1px] font-display text-[9px] font-semibold text-foreground">TS</span>
                types.ts
              </li>
              <li>
                <span className="mr-2 inline-block rounded-[4px] bg-[var(--pastel-teal)] px-1.5 py-[1px] font-display text-[9px] font-semibold text-foreground">TSX</span>
                Board.tsx
              </li>
              <li>
                <span className="mr-2 inline-block rounded-[4px] bg-[var(--pastel-teal)] px-1.5 py-[1px] font-display text-[9px] font-semibold text-foreground">TSX</span>
                Game.tsx
              </li>
            </ul>
          </div>
        </div>

        {/* Preview column */}
        <div className="flex flex-col">
          <div className="flex h-9 items-center gap-1 border-b border-border px-3 font-display text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
            <span className="ml-3 text-muted-foreground">preview · localhost:5173</span>
          </div>
          <div
            className="grid flex-1 place-items-center p-6 font-mono text-xs demo-loop"
            style={{ animationDelay: "1s", background: "var(--surface-elevated)" }}
          >
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 49 }).map((_, i) => (
                <span
                  key={i}
                  className="size-5 rounded-sm bg-background shadow-[0_0_0_1px_hsl(var(--border))]"
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes demoLoop {
          0%   { opacity: 0; transform: translateY(8px); }
          10%  { opacity: 1; transform: translateY(0); }
          90%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-4px); }
        }
      `}</style>
    </section>
  );
}
```

- [ ] **Step 2: Add to landing**

Update `marketing-landing.tsx`:

```tsx
import { MarketingLayout } from "./marketing-layout";
import { HeroSection } from "./hero-section";
import { HowItWorks } from "./how-it-works";
import { LiveDemo } from "./live-demo";

export function MarketingLanding() {
  return (
    <MarketingLayout>
      <HeroSection />
      <HowItWorks />
      <LiveDemo />
    </MarketingLayout>
  );
}
```

- [ ] **Step 3: Playwright MCP — verify section and loop**

1. `browser_navigate` → `http://localhost:5173/`
2. `browser_evaluate` → `document.querySelector('#demo')?.scrollIntoView({behavior: 'instant'})`
3. `browser_take_screenshot` → confirm: mock 2-column card with chat on left + preview on right; preview's mini grid visible
4. Wait 3 seconds and take another screenshot — elements should still animate; the pattern should be visibly cycling (capture the loop visually)

- [ ] **Step 4: Verify build**

```bash
pnpm --filter @code-artisan/frontend build
```

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/marketing/live-demo.tsx packages/frontend/src/components/marketing/marketing-landing.tsx
git commit -m "feat(frontend): marketing LiveDemo static mock loop

Chat column: fake user prompt + 'Made some changes' card showing aggregated
file list. Preview column: mini chessboard grid. Both cycle via CSS-only
keyframes under motion-safe.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Feature Bento grid

**Files:**
- Create: `packages/frontend/src/components/marketing/feature-tile.tsx`
- Create: `packages/frontend/src/components/marketing/feature-bento.tsx`
- Modify: `packages/frontend/src/components/marketing/marketing-landing.tsx`

- [ ] **Step 1: Create `feature-tile.tsx`**

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PastelKey = "coral" | "teal" | "orange" | "yellow" | "pink" | "moss";

const PASTEL_BG: Record<PastelKey, string> = {
  coral: "bg-[var(--pastel-coral)]",
  teal: "bg-[var(--pastel-teal)]",
  orange: "bg-[var(--pastel-orange)]",
  yellow: "bg-[var(--pastel-yellow)]",
  pink: "bg-[var(--pastel-pink)]",
  moss: "bg-[var(--pastel-moss)]",
};

export type TileSpan = 2 | 3 | 4 | 6;

export function FeatureTile({
  pastel,
  icon,
  title,
  caption,
  span = 2,
}: {
  pastel: PastelKey;
  icon: ReactNode;
  title: string;
  caption: string;
  span?: TileSpan;
}) {
  const colSpan =
    span === 6 ? "md:col-span-6"
    : span === 4 ? "md:col-span-4"
    : span === 3 ? "md:col-span-3"
    : "md:col-span-2";
  return (
    <article
      className={cn(
        "group flex min-h-[180px] flex-col justify-between rounded-2xl p-6 transition-transform duration-200 motion-safe:hover:-translate-y-0.5",
        PASTEL_BG[pastel],
        colSpan,
      )}
    >
      <div className="flex size-9 items-center justify-center rounded-lg bg-background/60 text-foreground shadow-[0_0_0_1px_hsl(var(--border))]">
        {icon}
      </div>
      <div>
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1 font-body text-[13px] leading-[1.5] text-foreground/70">{caption}</p>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Create `feature-bento.tsx`**

```tsx
import { FolderTree, TerminalSquare, Eye, Zap, Paperclip, History } from "lucide-react";
import { FeatureTile, type PastelKey, type TileSpan } from "./feature-tile";

type Feature = {
  pastel: PastelKey;
  icon: React.ReactNode;
  title: string;
  caption: string;
  span: TileSpan;
};

const FEATURES: Feature[] = [
  { pastel: "coral", icon: <FolderTree className="size-4" />, title: "File tree you can trust", caption: "Every file the agent touches appears instantly — grouped into one 'Made some changes' card.", span: 3 },
  { pastel: "teal", icon: <TerminalSquare className="size-4" />, title: "Real terminal, real output", caption: "Tools stream command output live. Errors surface inline with retry hooks.", span: 3 },
  { pastel: "orange", icon: <Eye className="size-4" />, title: "Live preview", caption: "Dev server mirrors your project — changes render without a reload.", span: 2 },
  { pastel: "yellow", icon: <Zap className="size-4" />, title: "Streaming end-to-end", caption: "SSE from agent loop to UI. No polling, no stalls, no guessing.", span: 2 },
  { pastel: "pink", icon: <Paperclip className="size-4" />, title: "Attachments", caption: "Drag a screenshot or doc right into the chat — agent reads, references, and builds.", span: 2 },
  { pastel: "moss", icon: <History className="size-4" />, title: "History that sticks", caption: "Every turn keeps its tool calls and file diffs — scroll back, branch forward.", span: 6 },
];

export function FeatureBento() {
  return (
    <section id="features" className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-10 text-center">
        <p className="font-display text-xs uppercase tracking-[0.08em] text-muted-foreground">Features</p>
        <h2 className="mt-2 font-display text-[32px] font-medium leading-[1.1] tracking-[-0.02em] md:text-[40px]">
          A full workshop, wrapped around a chat.
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        {FEATURES.map((f) => (
          <FeatureTile
            key={f.title}
            pastel={f.pastel}
            icon={f.icon}
            title={f.title}
            caption={f.caption}
            span={f.span}
          />
        ))}
      </div>
    </section>
  );
}
```

Note: spans form a 6-col bento rhythm — row 1 is 3+3, row 2 is 2+2+2, row 3 is one full-width 6. `FolderTree` is the lucide-react symbol for the tree icon; if the resolved `lucide-react` version does not export it, fall back to `Files` or `ListTree` — the import must resolve to an existing export.

- [ ] **Step 3: Add to landing**

Update `marketing-landing.tsx`:

```tsx
import { MarketingLayout } from "./marketing-layout";
import { HeroSection } from "./hero-section";
import { HowItWorks } from "./how-it-works";
import { LiveDemo } from "./live-demo";
import { FeatureBento } from "./feature-bento";

export function MarketingLanding() {
  return (
    <MarketingLayout>
      <HeroSection />
      <HowItWorks />
      <LiveDemo />
      <FeatureBento />
    </MarketingLayout>
  );
}
```

- [ ] **Step 4: Playwright MCP — verify**

1. `browser_navigate` → `http://localhost:5173/`
2. `browser_evaluate` → `document.querySelector('#features')?.scrollIntoView({behavior: 'instant'})`
3. `browser_take_screenshot` → confirm bento with 6 pastel tiles, asymmetric spans; hover effect on one tile via `browser_hover`
4. Take another screenshot during hover to confirm subtle rise

- [ ] **Step 5: Fix icon-export mismatch if any**

If the build fails because `FileTree` is not exported from `lucide-react`:

```bash
pnpm --filter @code-artisan/frontend build
```

Read the error; replace the missing symbol in `feature-bento.tsx` with an existing icon export (e.g. `FolderTree`, `Files`, `ListTree`). Re-run build.

- [ ] **Step 6: Verify build**

```bash
pnpm --filter @code-artisan/frontend build
```

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/components/marketing/feature-tile.tsx packages/frontend/src/components/marketing/feature-bento.tsx packages/frontend/src/components/marketing/marketing-landing.tsx
git commit -m "feat(frontend): marketing FeatureBento with pastel tiles

6-tile bento grid, asymmetric spans, pastel backgrounds as decoration
(no semantic binding). Hover lifts tiles 2px with transition-transform.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Full-page validation and final polish

**Files:** none (verification only, plus any small fixes the screenshots surface)

- [ ] **Step 1: Full-page screenshot — light mode**

1. `browser_navigate` → `http://localhost:5173/`
2. `browser_evaluate` → `document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light'); localStorage.setItem('code-artisan-theme','light')`
3. `browser_take_screenshot` with `fullPage: true` — confirm all 5 sections (nav + hero + how + demo + bento + footer) stack cleanly, no overlap, type hierarchy correct.

- [ ] **Step 2: Full-page screenshot — dark mode**

1. `browser_evaluate` → `document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark'); localStorage.setItem('code-artisan-theme','dark')`
2. `browser_take_screenshot` with `fullPage: true` — confirm: `#0a0b0e` near-black bg, `#ededf0` ink, pastel chips visible but desaturated, Blue 450 primary still readable.

- [ ] **Step 3: Authed redirect sanity**

1. If a GitHub login is available for testing: sign in via `/login`, wait, then `browser_navigate` → `http://localhost:5173/`. Confirm redirect to `/dashboard`.
2. If no test account available: skip — covered manually by user on next session.

- [ ] **Step 4: Nav scroll shadow**

1. `browser_navigate` → `http://localhost:5173/`
2. `browser_evaluate` → `window.scrollTo({ top: 100, behavior: 'instant' })`
3. `browser_take_screenshot` of the viewport — confirm nav now has subtle 1px hairline shadow under it.

- [ ] **Step 4.5: Console sanity**

`browser_console_messages` — assert no error- or warning-level entries (Vite HMR infos are allowed). Investigate any surfaced error before declaring done.

- [ ] **Step 5: Final build + lint**

```bash
pnpm --filter @code-artisan/frontend build
pnpm --filter @code-artisan/frontend lint
```

Both must exit 0. Address any lint warnings introduced by new files (e.g. `import/order`, unused imports).

- [ ] **Step 6: Stop dev server**

Kill the background Vite process started in Task 4.

- [ ] **Step 7: Optional polish commit**

If any small fixes were made during validation (icon swap, type repair, lint fix), commit them:

```bash
git add -A
git commit -m "chore(frontend): marketing landing post-validation polish

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If `git status` shows no changes, skip the commit.

- [ ] **Step 8: Verify full commit graph**

```bash
git log --oneline main -12
```

Expected: 8–9 new commits on `main` (one per Task 1–8, plus the optional polish).

---

## Post-plan follow-ups (tracked in spec §12)

- Sub-project 2 — Dashboard + Sidebar: consumes `sessionStorage["code-artisan.initialPrompt"]` on first render and pre-fills its prompt textarea; clears the key after read.
- Extract umbrella doc `2026-04-17-frontend-rewrite-anchors.md` when Sub-project 2 starts so the token/font section stops living inside the Marketing spec.
- Real LiveDemo — swap the CSS loop for a recorded agent turn (video-less option: ship a scripted SSE replay).
- SEO metadata on `/`: og:title, og:description, og:image, canonical.
- Mobile polish < 1024 px.

