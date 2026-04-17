FROM oven/bun:1 AS build
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/agent/package.json packages/agent/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/

# Install pnpm and dependencies
RUN bun install -g pnpm \
    && pnpm install --frozen-lockfile

# Install typescript globally for tsc
RUN bun install -g typescript

# Copy source files (agent is workspace dep of shared/backend, exports raw .ts)
COPY packages/shared/ packages/shared/
COPY packages/agent/ packages/agent/
COPY packages/backend/ packages/backend/
COPY packages/frontend/ packages/frontend/

# Build agent declarations first — shared imports types from agent's
# dist/index.d.ts (not source), so agent must be built before shared.
RUN cd packages/agent && tsc

# Build shared (tsc)
RUN cd packages/shared && tsc

# Build frontend (vite)
RUN cd packages/frontend && pnpm run build

# Build backend (bun build)
RUN cd packages/backend && bun run build

# Production stage
FROM oven/bun:1-slim
WORKDIR /app

COPY --from=build /app/packages/backend/dist ./dist
COPY --from=build /app/packages/backend/src/mcp/mcp-registry.json ./mcp/mcp-registry.json
COPY --from=build /app/packages/frontend/dist ./dist/public
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3001
CMD ["bun", "dist/index.js"]
