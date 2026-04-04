FROM oven/bun:1 AS build
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/

# Install pnpm and dependencies (enable build scripts for esbuild)
RUN bun install -g pnpm \
    && echo "enable-scripts=true" > .npmrc \
    && pnpm install --frozen-lockfile

# Install typescript globally for tsc
RUN bun install -g typescript

# Copy source files
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/
COPY packages/frontend/ packages/frontend/

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
COPY --from=build /app/packages/backend/src/mcp/mcp-registry.json ./dist/mcp/mcp-registry.json
COPY --from=build /app/packages/frontend/dist ./dist/public
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3001
CMD ["bun", "dist/index.js"]
