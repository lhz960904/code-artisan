FROM node:20-slim AS build
WORKDIR /app

# Install bun for the backend build step (single binary).
# pnpm itself runs under Node to avoid Bun's exports-condition resolver
# matching @better-auth/core's "dev-source" entry → loading src/*.ts whose
# `import type { DatabaseSync } from "node:sqlite"` Bun 1.3.13 can't resolve.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip ca-certificates \
    && curl -fsSL https://bun.sh/install | bash \
    && cp /root/.bun/bin/bun /usr/local/bin/bun \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config (.npmrc enables hoisted node-linker → small,
# fast-to-commit Docker layer; pnpm's symlink farm tanks Railway build time)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/agent/package.json packages/agent/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
# cli is a workspace member (published separately) but not deployed; keep
# its package.json for lockfile validity, skip its deps via --filter below
COPY packages/cli/package.json packages/cli/

# pnpm install runs under Node (not Bun) — see comment above.
RUN pnpm install --frozen-lockfile --filter '!@code-artisan/cli'

# Copy source files (agent is workspace dep of shared/backend, exports raw .ts)
COPY packages/shared/ packages/shared/
COPY packages/agent/ packages/agent/
COPY packages/backend/ packages/backend/
COPY packages/frontend/ packages/frontend/

# Use workspace-local tsc (via pnpm run) — global tsc can't resolve
# @types/* in /app/node_modules and breaks DOM/Bun globals.
# agent must be built before shared (shared imports its dist/.d.ts).
RUN cd packages/agent && pnpm run build
RUN cd packages/shared && pnpm run build

# Build frontend (vite)
RUN cd packages/frontend && pnpm run build

# Build backend (bun build — Bun is faster here and matches the runtime stage)
RUN cd packages/backend && bun run build

# Production stage
FROM oven/bun:1-slim
WORKDIR /app

COPY --from=build /app/packages/backend/dist ./dist
COPY --from=build /app/packages/backend/src/mcp/mcp-registry.json ./dist/mcp-registry.json
COPY --from=build /app/packages/frontend/dist ./dist/public
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3001
CMD ["bun", "dist/index.js"]
