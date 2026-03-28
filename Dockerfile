FROM oven/bun:1 AS build
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

# Install pnpm and dependencies
RUN bun install -g pnpm && pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/

# Build shared (tsc) + backend (bun build)
RUN cd packages/shared && pnpm run build
RUN cd packages/backend && pnpm run build

# Production stage
FROM oven/bun:1-slim
WORKDIR /app

# Copy built output and node_modules
COPY --from=build /app/packages/backend/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/backend/node_modules ./packages/backend/node_modules

EXPOSE 3001
CMD ["bun", "dist/index.js"]
