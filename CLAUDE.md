# code-artisan

Per-package architecture lives in each `packages/*/CLAUDE.md`. This file collects rules that apply across the whole repo.

## Comment Style

- **Default to no comments.** Naming + structure should carry the meaning.
- **Hard limit: 2 lines per comment block** — including `/** */` form. If it doesn't fit in 2 lines, either delete it or split into separate single-line comments next to the lines they explain.
- **Only write a comment for the non-obvious *why*** — hidden constraints, subtle invariants, workarounds. Never explain *what* the code does (the code does that).
- **Never write** JSDoc paragraphs, "fire-and-forget because…" task narration, "added for X flow" history notes, or `// removed` tombstones.
