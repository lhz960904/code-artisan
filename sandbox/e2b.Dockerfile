# Custom E2B sandbox template for code-artisan.
#
# Extends the code-interpreter base with:
#   1. Bun runtime (required by bundled Skills, e.g. hono-fullstack)
#   2. Preloaded Skills at /opt/skills/
#
# Build + publish from the repo root with:
#   pnpm sandbox:build

FROM e2bdev/code-interpreter:latest

# Install Bun directly under /usr/local so it's in PATH for every user.
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash \
    && bun --version

# Preload Skills. Build context is `sandbox/` so this copies `sandbox/skills/`.
COPY skills /opt/skills
