FROM oven/bun:1 AS build
WORKDIR /app

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

# Install pnpm and dependencies (skip cli — saves ~120 packages of ink/react/etc)
RUN bun install -g pnpm \
    && pnpm install --frozen-lockfile --filter '!@code-artisan/cli'

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

# Build backend (bun build)
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
