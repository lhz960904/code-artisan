# Phase 6: Deployment — Railway + Cloudflare Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the Web AI Coding Agent to production: backend on Railway (Docker/Bun), frontend on Cloudflare Pages, database on Supabase cloud, domain on Cloudflare.

**Architecture:** Frontend static build on Cloudflare Pages (`app.domain.com`), backend on Railway (`api.domain.com`). Frontend API calls point to backend via `VITE_API_URL` env var. CORS configured to allow the frontend origin. Supabase and E2B remain cloud-hosted.

**Tech Stack:** Docker (Bun runtime), Railway, Cloudflare Pages, Cloudflare DNS

---

## Production Architecture

```
app.domain.com (Cloudflare Pages)
  → Static React build
  → API calls to api.domain.com

api.domain.com (Railway)
  → Hono backend (Bun in Docker)
  → SSE streaming
  → Supabase DB (cloud)
  → Claude API
  → E2B Sandbox
```

## File Structure

```
(root)
├── Dockerfile                          # Create: Bun-based backend image
├── .dockerignore                       # Create: exclude unnecessary files
├── packages/
│   ├── backend/src/
│   │   └── index.ts                    # Modify: dynamic CORS origins
│   └── frontend/src/
│       └── lib/
│           ├── api.ts                  # Modify: API_BASE from env var
│           └── event-source.ts         # Modify: API_BASE from env var
```

---

### Task 1: Dynamic CORS configuration

**Files:**
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Make CORS origin configurable**

Replace the hardcoded CORS config in `packages/backend/src/index.ts`:

```typescript
// Replace:
cors({
  origin: ["http://localhost:5173"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE"],
  allowHeaders: ["Content-Type", "Authorization"],
})

// With:
cors({
  origin: (origin) => {
    // Allow configured origins + localhost for dev
    const allowed = [
      "http://localhost:5173",
      process.env.FRONTEND_URL,
    ].filter(Boolean);
    return allowed.includes(origin) ? origin : allowed[0];
  },
  allowMethods: ["GET", "POST", "PATCH", "DELETE"],
  allowHeaders: ["Content-Type", "Authorization"],
})
```

- [ ] **Step 2: Add FRONTEND_URL to env schema**

In `packages/backend/src/env.ts`, add:

```typescript
FRONTEND_URL: z.string().url().optional(),
```

- [ ] **Step 3: Verify compiles**

```bash
cd packages/backend && npx tsc --noEmit
```

---

### Task 2: Frontend API_BASE from env var

**Files:**
- Modify: `packages/frontend/src/lib/api.ts`
- Modify: `packages/frontend/src/lib/event-source.ts`

- [ ] **Step 1: Update api.ts to use VITE_API_URL**

In `packages/frontend/src/lib/api.ts`, change:

```typescript
// Replace:
const API_BASE = "/api";
// With:
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";
```

- [ ] **Step 2: Update event-source.ts to use VITE_API_URL**

In `packages/frontend/src/lib/event-source.ts`, change:

```typescript
// Replace:
const API_BASE = "/api";
// With:
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";
```

- [ ] **Step 3: Update vite envPrefix**

In `packages/frontend/vite.config.ts`, ensure `VITE_` is in the envPrefix (it already is).

- [ ] **Step 4: Update .env.example**

Add to `.env.example`:

```
# Frontend (only needed for production build)
VITE_API_URL=https://api.yourdomain.com

# Backend (only needed for production)
FRONTEND_URL=https://app.yourdomain.com
```

---

### Task 3: Create Dockerfile for Railway

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

Create `.dockerignore` at project root:

```
node_modules
dist
.env
.env.local
*.log
.DS_Store
.git
docs
```

- [ ] **Step 2: Create Dockerfile**

Create `Dockerfile` at project root:

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

RUN bun install --frozen-lockfile

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/

# Build shared + backend
RUN cd packages/shared && bun run build
RUN cd packages/backend && bun run build

# Production stage
FROM oven/bun:1-slim
WORKDIR /app

COPY --from=base /app/node_modules node_modules
COPY --from=base /app/packages/shared/dist packages/shared/dist
COPY --from=base /app/packages/shared/package.json packages/shared/
COPY --from=base /app/packages/backend/dist packages/backend/dist
COPY --from=base /app/packages/backend/package.json packages/backend/
COPY --from=base /app/package.json .

EXPOSE 3001

CMD ["bun", "packages/backend/dist/index.js"]
```

- [ ] **Step 3: Add build script to shared package**

Check if `packages/shared/package.json` has a `build` script. If not, add:

```json
{
  "scripts": {
    "build": "tsc -b"
  }
}
```

- [ ] **Step 4: Test Docker build locally**

```bash
docker build -t web-ai-coding-agent .
docker run --env-file .env -p 3001:3001 web-ai-coding-agent
```

Verify: `curl http://localhost:3001/api/health` returns `{"status":"ok"}`.

---

### Task 4: Railway deployment configuration

**Files:**
- Create: `railway.toml` (optional, Railway auto-detects Dockerfile)

- [ ] **Step 1: Create railway.toml**

Create `railway.toml` at project root:

```toml
[build]
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

- [ ] **Step 2: Deploy to Railway**

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Create project: `railway init`
4. Set environment variables:
   ```bash
   railway variables set DATABASE_URL="your-supabase-connection-string"
   railway variables set SUPABASE_URL="https://your-project.supabase.co"
   railway variables set SUPABASE_PUBLISHABLE_KEY="your-key"
   railway variables set SUPABASE_SECRET_KEY="your-secret"
   railway variables set ANTHROPIC_API_KEY="your-key"
   railway variables set E2B_API_KEY="your-key"
   railway variables set FRONTEND_URL="https://app.yourdomain.com"
   railway variables set PORT="3001"
   ```
5. Deploy: `railway up`
6. Get the Railway URL: `railway domain`

- [ ] **Step 3: Verify deployment**

```bash
curl https://your-railway-url.railway.app/api/health
```
Expected: `{"status":"ok"}`

---

### Task 5: Cloudflare Pages deployment

- [ ] **Step 1: Push code to GitHub**

Create a GitHub repo and push:

```bash
git remote add origin git@github.com:yourusername/web-ai-coding-agent.git
git push -u origin main
```

- [ ] **Step 2: Connect to Cloudflare Pages**

1. Go to Cloudflare Dashboard → Pages → Create a project
2. Connect GitHub repo
3. Build settings:
   - **Build command**: `cd packages/frontend && npm run build`
   - **Build output directory**: `packages/frontend/dist`
   - **Root directory**: `/` (monorepo root)
4. Environment variables:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   VITE_API_URL=https://api.yourdomain.com
   ```
5. Node.js version: set `NODE_VERSION=20` in env vars

- [ ] **Step 3: Verify frontend deployment**

Open the Cloudflare Pages URL (e.g., `your-project.pages.dev`). The app should load. API calls should reach the Railway backend.

---

### Task 6: Domain + DNS setup

- [ ] **Step 1: Register domain on Cloudflare**

1. Cloudflare Dashboard → Registrar → Register a domain
2. Choose a `.com` / `.dev` / `.app` domain

- [ ] **Step 2: Configure DNS records**

In Cloudflare DNS settings:

```
app.yourdomain.com  → CNAME → your-project.pages.dev (Cloudflare Pages)
api.yourdomain.com  → CNAME → your-railway-url.railway.app (Railway)
```

- [ ] **Step 3: Configure custom domain in Railway**

1. Railway Dashboard → Project → Settings → Domains
2. Add `api.yourdomain.com`
3. Railway will verify the CNAME

- [ ] **Step 4: Configure custom domain in Cloudflare Pages**

1. Cloudflare Pages → Project → Custom domains
2. Add `app.yourdomain.com`

- [ ] **Step 5: Update environment variables with final domains**

Railway:
```bash
railway variables set FRONTEND_URL="https://app.yourdomain.com"
```

Cloudflare Pages → Environment variables:
```
VITE_API_URL=https://api.yourdomain.com
```

Trigger redeploy on both platforms.

---

### Task 7: Verification

- [ ] **Step 1: Health check**

```bash
curl https://api.yourdomain.com/api/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 2: Full E2E test**

1. Open `https://app.yourdomain.com`
2. Create a new conversation
3. Send "Write a hello world in Python and run it"
4. Verify: streaming text, tool calls, file tree, terminal, editor all work
5. Test confirm mode toggle
6. Test preview (start_server)

- [ ] **Step 3: SSE streaming test**

Open browser DevTools → Network → filter EventStream. Verify SSE connection to `api.yourdomain.com/api/conversations/:id/stream` establishes and receives events.
