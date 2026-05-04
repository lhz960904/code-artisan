import { createRoute } from "@tanstack/react-router";
import type {
  Attachment,
  StoredAssistantMessage,
  StoredMessage,
  StoredToolMessage,
  StoredUserMessage,
  ToolResultContent,
} from "@code-artisan/shared";
import { MessageList } from "@/components/chat/message-list";
import { ThemeToggle } from "@/components/common/theme-toggle";
import type { ChatStatus } from "@/hooks/use-chat";
import { rootRoute } from "./layout/root";

export const debugMessagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/debug/messages",
  component: DebugMessagesPage,
});

interface Scenario {
  id: string;
  label: string;
  note?: string;
  messages: StoredMessage[];
  status?: ChatStatus;
}

const CONVERSATION_ID = "debug";
const BASE_TIME = "2026-04-20T00:00:00.000Z";

function userMessage(
  id: string,
  content: StoredUserMessage["content"],
  attachments?: Attachment[],
): StoredUserMessage {
  return {
    id,
    conversationId: CONVERSATION_ID,
    role: "user",
    content,
    createdAt: BASE_TIME,
    ...(attachments ? { metadata: { attachments } } : {}),
  };
}

const SAMPLE_IMAGE_ATTACHMENT: Attachment = {
  fileId: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400",
  fileName: "mockup.png",
  mimeType: "image/png",
  size: 184_320,
};

const SAMPLE_IMAGE_ATTACHMENT_2: Attachment = {
  fileId: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400",
  fileName: "palette.jpg",
  mimeType: "image/jpeg",
  size: 256_000,
};

const SAMPLE_PDF_ATTACHMENT: Attachment = {
  fileId: "demo-pdf-1",
  fileName: "product-spec.pdf",
  mimeType: "application/pdf",
  size: 482_100,
};

const SAMPLE_MD_ATTACHMENT: Attachment = {
  fileId: "demo-md-1",
  fileName: "requirements.md",
  mimeType: "text/markdown",
  size: 3_840,
};

const SAMPLE_TS_ATTACHMENT: Attachment = {
  fileId: "demo-ts-1",
  fileName: "router.ts",
  mimeType: "application/typescript",
  size: 12_450,
};

function assistantMessage(
  id: string,
  content: StoredAssistantMessage["content"],
  metadata?: Record<string, unknown>,
): StoredAssistantMessage {
  return {
    id,
    conversationId: CONVERSATION_ID,
    role: "assistant",
    content,
    createdAt: BASE_TIME,
    ...(metadata ? { metadata } : {}),
  };
}

function toolMessage(id: string, content: StoredToolMessage["content"]): StoredToolMessage {
  return { id, conversationId: CONVERSATION_ID, role: "tool", content, createdAt: BASE_TIME };
}

function toolResult(toolUseId: string, body: string): ToolResultContent {
  return { type: "tool_result", tool_use_id: toolUseId, content: body };
}

const MARKDOWN_SAMPLE = `Sure — here's a quick plan:

1. **Scaffold** the Vite app with \`pnpm create vite\`.
2. Wire up \`TanStack Router\` for SPA routing.
3. Add \`shadcn/ui\` primitives.

\`\`\`ts
import { createRouter } from "@tanstack/react-router";

export const router = createRouter({ routeTree });
\`\`\`

| Step | Owner | ETA |
| ---- | ----- | --- |
| Scaffold | you | 10m |
| Router   | me  | 20m |
| Polish   | me  | 1h  |

> Ping me if you hit a snag. Final URL will be served from the sandbox preview.
`;

const BASH_STDOUT = `pnpm install
Lockfile is up to date, resolution step is skipped
Packages: +182
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 182, reused 180, downloaded 2, added 182, done
dependencies:
+ react 19.0.0
+ react-dom 19.0.0
+ vite 6.0.7
Done in 2.4s`;

const READ_FILE_OUTPUT = `import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routes";

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}`;

const GREP_OUTPUT = `Found 4 matches:
src/app.tsx:18:  defaultPreload: "intent",
src/pages/chat.tsx:42:    defaultPreload: "viewport",
src/pages/dashboard.tsx:9:  preloaded: true,
src/api/queries/index.ts:12:  defaultStaleTime: 30_000,`;

const GLOB_OUTPUT = `Found 8 matches:
src/components/chat/chat-panel.tsx
src/components/chat/message-bubble.tsx
src/components/chat/message-list.tsx
src/components/chat/sender.tsx
src/components/chat/tool-call-item.tsx
src/components/chat/attachment-preview.tsx
src/hooks/use-chat.ts
src/hooks/use-file-upload.ts`;

const LS_OUTPUT = `package.json
pnpm-lock.yaml
src/
src/app.tsx
src/index.css
src/main.tsx
src/pages/
tsconfig.json
vite.config.ts`;

const WEB_SEARCH_OUTPUT = `Results for "TanStack Router migration":

1. TanStack Router — File-Based Routing
   https://tanstack.com/router/latest/docs/framework/react/guide/file-based-routing
   File-based routing is the recommended way to build...

2. Migrating from React Router v6
   https://tanstack.com/router/latest/docs/framework/react/guide/migrate-from-react-router
   Step-by-step guide for moving from react-router-dom...`;

const SCENARIOS: Scenario[] = [
  {
    id: "user-text",
    label: "User · text",
    messages: [userMessage("u1", [{ type: "text", text: "帮我搭一个 Vite + TanStack Router 的脚手架，顺便把 shadcn/ui 装上。" }])],
  },
  {
    id: "user-image",
    label: "User · image only",
    messages: [userMessage("u2", [], [SAMPLE_IMAGE_ATTACHMENT])],
  },
  {
    id: "user-text-image",
    label: "User · text + image",
    messages: [
      userMessage(
        "u3",
        [{ type: "text", text: "参考这张图的配色，帮我做一个 landing page 的 hero section。" }],
        [SAMPLE_IMAGE_ATTACHMENT_2],
      ),
    ],
  },
  {
    id: "user-text-file",
    label: "User · text + file",
    messages: [
      userMessage(
        "u-file",
        [{ type: "text", text: "帮我看一下这个需求文档有没有逻辑漏洞。" }],
        [SAMPLE_PDF_ATTACHMENT],
      ),
    ],
  },
  {
    id: "user-text-multi-files",
    label: "User · text + multiple files",
    messages: [
      userMessage(
        "u-multi-file",
        [{ type: "text", text: "对一下这两份文档，哪些是我已经实现的，哪些还没。" }],
        [SAMPLE_MD_ATTACHMENT, SAMPLE_TS_ATTACHMENT],
      ),
    ],
  },
  {
    id: "user-mixed-all",
    label: "User · image + file + text",
    note: "三种混排：图片网格在上、文件 chip 在中、文字气泡在下",
    messages: [
      userMessage(
        "u-mixed",
        [{ type: "text", text: "参考这张截图的布局，看看附带的 spec 里哪些字段我还没实现。" }],
        [SAMPLE_IMAGE_ATTACHMENT, SAMPLE_PDF_ATTACHMENT, SAMPLE_MD_ATTACHMENT],
      ),
    ],
  },
  {
    id: "assistant-markdown",
    label: "Assistant · markdown",
    note: "headings / list / code / table / blockquote",
    messages: [assistantMessage("a1", [{ type: "text", text: MARKDOWN_SAMPLE }])],
  },
  {
    id: "assistant-thinking-streaming",
    label: "Assistant · thinking + text (streaming)",
    note: "流式中显示 '思考中'，内容自动展开；status=streaming",
    status: "streaming",
    messages: [
      assistantMessage("a-think-s", [
        {
          type: "thinking",
          thinking:
            "让我先看一下当前的路由结构 — 需要确认 TanStack Router 是 file-based 还是 code-based，以及是否已经有 authedRoute wrapper。",
        },
        { type: "text", text: "看起来目前是 code-based routing，我继续添加 `/debug/messages` 到 `rootRoute` 下。" },
      ]),
    ],
  },
  {
    id: "assistant-thinking-done",
    label: "Assistant · thinking + text (done)",
    note: "流式结束后显示 '已思考'，默认折叠，点击可展开",
    messages: [
      assistantMessage("a-think-d", [
        {
          type: "thinking",
          thinking:
            "让我先看一下当前的路由结构 — 需要确认 TanStack Router 是 file-based 还是 code-based，以及是否已经有 authedRoute wrapper。",
        },
        { type: "text", text: "看起来目前是 code-based routing，我继续添加 `/debug/messages` 到 `rootRoute` 下。" },
      ]),
    ],
  },
  {
    id: "tool-bash-success",
    label: "Tool · bash · success",
    messages: [
      assistantMessage("a-bash", [
        { type: "text", text: "先装依赖。" },
        { type: "tool_use", id: "tu-bash-1", name: "bash", input: { description: "install deps", command: "pnpm install" } },
      ]),
      toolMessage("t-bash-1", [toolResult("tu-bash-1", BASH_STDOUT)]),
    ],
  },
  {
    id: "tool-bash-error",
    label: "Tool · bash · error",
    messages: [
      assistantMessage("a-bash-err", [
        { type: "tool_use", id: "tu-bash-2", name: "bash", input: { description: "run tests", command: "pnpm test" } },
      ]),
      toolMessage("t-bash-2", [toolResult("tu-bash-2", "Error: Command failed with exit code 1\nFAIL  src/foo.test.ts\n  ✕ handles edge case (14ms)\n\n    expect(received).toBe(expected)\n    Expected: 42\n    Received: 41")]),
    ],
  },
  {
    id: "tool-bash-pending",
    label: "Tool · bash · pending (no result)",
    note: "模拟工具还在跑的状态",
    messages: [
      assistantMessage("a-bash-pending", [
        { type: "tool_use", id: "tu-bash-3", name: "bash", input: { description: "start dev server", command: "pnpm dev" } },
      ]),
    ],
  },
  {
    id: "tool-read-file",
    label: "Tool · read_file",
    messages: [
      assistantMessage("a-read", [
        { type: "tool_use", id: "tu-read", name: "read_file", input: { description: "inspect router", path: "/home/user/project/src/app.tsx" } },
      ]),
      toolMessage("t-read", [toolResult("tu-read", READ_FILE_OUTPUT)]),
    ],
  },
  {
    id: "tool-write-file",
    label: "Tool · write_file",
    messages: [
      assistantMessage("a-write", [
        {
          type: "tool_use",
          id: "tu-write",
          name: "write_file",
          input: {
            description: "create debug page",
            path: "/home/user/project/src/pages/debug-messages.tsx",
            content: "export function DebugMessagesPage() {\n  return <div>WIP</div>;\n}\n",
          },
        },
      ]),
      toolMessage("t-write", [toolResult("tu-write", "OK")]),
    ],
  },
  {
    id: "tool-str-replace",
    label: "Tool · str_replace",
    messages: [
      assistantMessage("a-edit", [
        {
          type: "tool_use",
          id: "tu-edit",
          name: "str_replace",
          input: {
            description: "rename prop",
            path: "/home/user/project/src/components/chat/message-list.tsx",
            old_str: "streamingMessageId: string | null;",
            new_str: "status: ChatStatus;",
          },
        },
      ]),
      toolMessage("t-edit", [toolResult("tu-edit", "OK")]),
    ],
  },
  {
    id: "tool-ls",
    label: "Tool · ls",
    messages: [
      assistantMessage("a-ls", [
        { type: "tool_use", id: "tu-ls", name: "ls", input: { description: "scan root", path: "/home/user/project" } },
      ]),
      toolMessage("t-ls", [toolResult("tu-ls", LS_OUTPUT)]),
    ],
  },
  {
    id: "tool-glob",
    label: "Tool · glob",
    note: "目前 UI 没配 icon，会 fallback 到 terminal",
    messages: [
      assistantMessage("a-glob", [
        {
          type: "tool_use",
          id: "tu-glob",
          name: "glob",
          input: { description: "find chat components", pattern: "src/**/chat/*.{ts,tsx}", path: "/home/user/project" },
        },
      ]),
      toolMessage("t-glob", [toolResult("tu-glob", GLOB_OUTPUT)]),
    ],
  },
  {
    id: "tool-grep",
    label: "Tool · grep",
    note: "同上，UI 没配 icon",
    messages: [
      assistantMessage("a-grep", [
        {
          type: "tool_use",
          id: "tu-grep",
          name: "grep",
          input: { description: "hunt preload flags", pattern: "defaultPreload", path: "/home/user/project/src", include: "*.tsx" },
        },
      ]),
      toolMessage("t-grep", [toolResult("tu-grep", GREP_OUTPUT)]),
    ],
  },
  {
    id: "todo-interrupted",
    label: "Todo · interrupted (no agent running)",
    note: "用户刷新页面 / 服务重启后回来：in_progress 还在但 status=ready → 头部显示 Interrupted 标签，图标静止",
    messages: [
      userMessage("u-int", [{ type: "text", text: "使用 todo 模式，创建一个 JS 排序文件，并执行它" }]),
      assistantMessage("a-int-plan", [
        { type: "text", text: "我先看下项目目录。" },
        { type: "tool_use", id: "tu-int-ls", name: "ls", input: { description: "scan", path: "/home/user/project" } },
      ]),
      toolMessage("t-int-ls", [toolResult("tu-int-ls", "(empty)")]),
      assistantMessage("a-int-2", [
        {
          type: "tool_use",
          id: "tu-int-plan",
          name: "todo_write",
          input: {
            name: "创建 JS 排序文件并执行",
            todos: [
              { id: "1", content: "创建 JS 排序文件 (包含多种排序算法)", status: "in_progress" },
              { id: "2", content: "执行排序文件并查看结果", status: "pending" },
            ],
            merge: false,
          },
        },
      ]),
      toolMessage("t-int-plan", [toolResult("tu-int-plan", "Plan ... 0/2 completed.")]),
      // 后续没有任何消息 — agent 中断
    ],
  },
  {
    id: "todo-with-thinking-per-step",
    label: "Todo · realistic flow (thinking + tool per step)",
    note: "复现真实后端行为：每条 assistant 消息自带 thinking + tool_use。期望：中间 thinking 被吸收，只保留最终答复的 thinking",
    messages: [
      userMessage("u-real", [{ type: "text", text: "使用 todo 模式，创建一个 JS 排序文件，并执行它" }]),
      assistantMessage("a-r-1", [
        { type: "thinking", thinking: "用户想 todo 模式 — 拆成两步：创建文件、执行文件。" },
        {
          type: "tool_use",
          id: "r-tu-plan",
          name: "todo_write",
          input: {
            name: "JS 排序",
            todos: [
              { id: "r1", content: "创建 JS 排序文件", status: "in_progress" },
              { id: "r2", content: "执行排序文件", status: "pending" },
            ],
            merge: false,
          },
        },
      ]),
      toolMessage("r-t-plan", [toolResult("r-tu-plan", "Todo list updated, 0/2 completed.")]),
      assistantMessage("a-r-2", [
        { type: "thinking", thinking: "写一个包含冒泡排序的文件。" },
        { type: "tool_use", id: "r-tu-write", name: "write_file", input: { description: "create sort file", path: "/home/user/project/sort.js", content: "function bubbleSort(arr) { ... }" } },
      ]),
      toolMessage("r-t-write", [toolResult("r-tu-write", "OK")]),
      assistantMessage("a-r-3", [
        { type: "thinking", thinking: "文件创建成功，更新 todo 状态。" },
        {
          type: "tool_use",
          id: "r-tu-advance",
          name: "todo_write",
          input: {
            name: "JS 排序",
            todos: [
              { id: "r1", content: "创建 JS 排序文件", status: "completed" },
              { id: "r2", content: "执行排序文件", status: "in_progress" },
            ],
            merge: true,
          },
        },
      ]),
      toolMessage("r-t-advance", [toolResult("r-tu-advance", "Todo list updated, 1/2 completed.")]),
      assistantMessage("a-r-4", [
        { type: "thinking", thinking: "现在执行这个 JS 文件。" },
        { type: "tool_use", id: "r-tu-bash", name: "bash", input: { description: "run sort file", command: "node /home/user/project/sort.js" } },
      ]),
      toolMessage("r-t-bash", [toolResult("r-tu-bash", "排序前: [64, 34, 25, 12, 22, 11, 90]\n排序后: [11, 12, 22, 25, 34, 64, 90]")]),
      assistantMessage("a-r-5", [
        { type: "thinking", thinking: "执行成功，标记所有 todo 完成。" },
        {
          type: "tool_use",
          id: "r-tu-done",
          name: "todo_write",
          input: {
            name: "JS 排序",
            todos: [
              { id: "r1", content: "创建 JS 排序文件", status: "completed" },
              { id: "r2", content: "执行排序文件", status: "completed" },
            ],
            merge: true,
          },
        },
      ]),
      toolMessage("r-t-done", [toolResult("r-tu-done", "Todo list updated, 2/2 completed.")]),
      assistantMessage("a-r-final", [
        { type: "thinking", thinking: "任务完成，总结结果。" },
        {
          type: "text",
          text: "已完成！✅\n\n1. **创建了 JS 排序文件** — `/home/user/project/sort.js`（冒泡排序）\n2. **执行结果**：\n   - 排序前: `[64, 34, 25, 12, 22, 11, 90]`\n   - 排序后: `[11, 12, 22, 25, 34, 64, 90]`",
        },
      ]),
    ],
  },
  {
    id: "todo-single-running",
    label: "Todo · single todo with running step (live)",
    note: "status=streaming → in_progress 图标转圈、最后一步无 result 也转圈",
    status: "streaming",
    messages: [
      assistantMessage("a-todo-a", [
        {
          type: "tool_use",
          id: "tu-todo-a",
          name: "todo_write",
          input: {
            name: "Onboarding scaffold",
            todos: [{ id: "t1", content: "Scaffold onboarding routes", status: "in_progress" }],
            merge: false,
          },
        },
        { type: "tool_use", id: "tu-step-1", name: "write_file", input: { description: "layout", path: "/home/user/project/src/pages/onboarding/layout.tsx", content: "..." } },
      ]),
      toolMessage("t-step-1", [toolResult("tu-step-1", "OK")]),
      assistantMessage("a-step-2", [
        { type: "tool_use", id: "tu-step-2", name: "write_file", input: { description: "picker", path: "/home/user/project/src/pages/onboarding/pick-model.tsx", content: "..." } },
      ]),
      toolMessage("t-step-2", [toolResult("tu-step-2", "OK")]),
      assistantMessage("a-step-3-running", [
        { type: "tool_use", id: "tu-step-3", name: "bash", input: { description: "typecheck", command: "pnpm -F frontend typecheck" } },
      ]),
      // no toolMessage for tu-step-3 → step remains in_progress
    ],
  },
  {
    id: "todo-sequence",
    label: "Todo · multi-task progression (live)",
    note: "三个 todo 依次推进：A 已完成、B 进行中、C 待办；status=streaming，B 的最后一步在转圈",
    status: "streaming",
    messages: [
      assistantMessage("a-plan", [
        { type: "text", text: "先列计划，再分步骤执行。" },
        {
          type: "tool_use",
          id: "tu-plan-1",
          name: "todo_write",
          input: {
            name: "Onboarding flow",
            todos: [
              { id: "t1", content: "Scaffold onboarding routes", status: "in_progress" },
              { id: "t2", content: "Wire GitHub OAuth callback", status: "pending" },
              { id: "t3", content: "Build welcome steps", status: "pending" },
            ],
            merge: false,
          },
        },
        { type: "tool_use", id: "tu-seq-1", name: "write_file", input: { description: "layout", path: "/home/user/project/src/pages/onboarding/layout.tsx", content: "..." } },
      ]),
      toolMessage("t-seq-1", [toolResult("tu-seq-1", "OK")]),
      assistantMessage("a-seq-2", [
        { type: "tool_use", id: "tu-seq-2", name: "write_file", input: { description: "picker", path: "/home/user/project/src/pages/onboarding/pick-model.tsx", content: "..." } },
        { type: "tool_use", id: "tu-seq-3", name: "str_replace", input: { description: "register route", path: "/home/user/project/src/app.tsx", old_str: "...", new_str: "..." } },
      ]),
      toolMessage("t-seq-2", [toolResult("tu-seq-2", "OK")]),
      toolMessage("t-seq-3", [toolResult("tu-seq-3", "OK")]),
      assistantMessage("a-advance", [
        {
          type: "tool_use",
          id: "tu-plan-2",
          name: "todo_write",
          input: {
            name: "Onboarding flow",
            todos: [
              { id: "t1", content: "Scaffold onboarding routes", status: "completed" },
              { id: "t2", content: "Wire GitHub OAuth callback", status: "in_progress" },
              { id: "t3", content: "Build welcome steps", status: "pending" },
            ],
            merge: true,
          },
        },
        { type: "tool_use", id: "tu-seq-4", name: "read_file", input: { description: "auth client", path: "/home/user/project/src/lib/auth-client.ts" } },
      ]),
      toolMessage("t-seq-4", [toolResult("tu-seq-4", READ_FILE_OUTPUT)]),
      assistantMessage("a-seq-5-running", [
        { type: "tool_use", id: "tu-seq-5", name: "str_replace", input: { description: "gate", path: "/home/user/project/src/pages/layout/authed.tsx", old_str: "...", new_str: "..." } },
      ]),
      // tu-seq-5 left running → shows spinner on the last step of todo B
    ],
  },
  {
    id: "tool-group-done",
    label: "Tool group · consecutive actions (collapsed)",
    note: "非 todo 模式下连续多个 tool_use 应聚合为 'N actions taken'，默认折叠，点击展开",
    messages: [
      userMessage("u-grp", [{ type: "text", text: '把 app 改成 "TODO Manager" 品牌。' }]),
      assistantMessage("a-grp-1", [{ type: "text", text: 'I\'ll update the app to "TODO Manager" branding.' }]),
      assistantMessage("a-grp-2", [
        {
          type: "tool_use",
          id: "tu-grp-1",
          name: "str_replace",
          input: { description: "rename header", path: "/home/user/project/src/components/Auth.tsx", old_str: "App", new_str: "TODO Manager" },
        },
      ]),
      toolMessage("t-grp-1", [toolResult("tu-grp-1", "OK")]),
      assistantMessage("a-grp-3", [
        {
          type: "tool_use",
          id: "tu-grp-2",
          name: "str_replace",
          input: { description: "rename in todo list", path: "/home/user/project/src/components/TodoList.tsx", old_str: "App", new_str: "TODO Manager" },
        },
      ]),
      toolMessage("t-grp-2", [toolResult("tu-grp-2", "OK")]),
      assistantMessage("a-grp-4", [
        {
          type: "tool_use",
          id: "tu-grp-3",
          name: "bash",
          input: { description: "build", command: "pnpm build" },
        },
      ]),
      toolMessage("t-grp-3", [toolResult("tu-grp-3", "Built in 1.4s")]),
      assistantMessage("a-grp-final", [{ type: "text", text: 'Done. The app is now branded as "TODO Manager".' }]),
    ],
  },
  {
    id: "tool-group-running",
    label: "Tool group · running (live, default expanded)",
    note: "status=streaming 时分组默认展开；最后一个 action 没结果，header 显示转圈",
    status: "streaming",
    messages: [
      userMessage("u-grp-r", [{ type: "text", text: "重构一下导航组件。" }]),
      assistantMessage("a-grp-r-1", [{ type: "text", text: "好的，分几步处理。" }]),
      assistantMessage("a-grp-r-2", [
        { type: "tool_use", id: "tu-r-1", name: "read_file", input: { description: "inspect", path: "/home/user/project/src/components/Nav.tsx" } },
      ]),
      toolMessage("t-r-1", [toolResult("tu-r-1", "// nav contents")]),
      assistantMessage("a-grp-r-3", [
        { type: "tool_use", id: "tu-r-2", name: "str_replace", input: { description: "extract item", path: "/home/user/project/src/components/Nav.tsx", old_str: "...", new_str: "..." } },
      ]),
      toolMessage("t-r-2", [toolResult("tu-r-2", "OK")]),
      assistantMessage("a-grp-r-4", [
        { type: "tool_use", id: "tu-r-3", name: "bash", input: { description: "typecheck", command: "pnpm -F frontend typecheck" } },
      ]),
      // tu-r-3 left running → header shows live spinner
    ],
  },
  {
    id: "tool-multi",
    label: "Assistant · text + multiple tool_use in one message",
    messages: [
      assistantMessage("a-multi", [
        { type: "text", text: "先读两个关键文件对比一下。" },
        { type: "tool_use", id: "tu-m1", name: "read_file", input: { description: "router entry", path: "/home/user/project/src/app.tsx" } },
        { type: "tool_use", id: "tu-m2", name: "read_file", input: { description: "chat panel", path: "/home/user/project/src/components/chat/chat-panel.tsx" } },
      ]),
      toolMessage("t-m1", [toolResult("tu-m1", READ_FILE_OUTPUT)]),
      toolMessage("t-m2", [toolResult("tu-m2", "// chat-panel.tsx contents here …")]),
    ],
  },
  {
    id: "tool-web-search",
    label: "Tool · web_search (not yet wired in backend, UI reference)",
    messages: [
      assistantMessage("a-ws", [
        {
          type: "tool_use",
          id: "tu-ws",
          name: "web_search",
          input: { description: "lookup docs", query: "TanStack Router migration", maxResults: 5 },
        },
      ]),
      toolMessage("t-ws", [toolResult("tu-ws", WEB_SEARCH_OUTPUT)]),
    ],
  },
  {
    id: "compacted",
    label: "System · compaction (hides prior turns)",
    note: "压缩点之前的消息应该被隐藏，只剩下 summary 卡片 + 后续消息",
    messages: [
      userMessage("u-old-1", [{ type: "text", text: "（这条早期用户消息应该被隐藏）" }]),
      assistantMessage("a-old-1", [{ type: "text", text: "（这条早期 assistant 回复应该被隐藏）" }]),
      assistantMessage(
        "a-comp",
        [
          {
            type: "text",
            text: "SUMMARY: 用户要求搭 Vite + TanStack Router 脚手架；助手装好依赖、注册了根路由和 authed 路由。讨论了 shadcn/ui 的初始化方式，已建立 components.json。",
          },
        ],
        { compacted: true },
      ),
      userMessage("u-new", [{ type: "text", text: "接着搞状态管理 — 我们用 Zustand。" }]),
    ],
  },
];

function DebugMessagesPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-6 py-3 backdrop-blur">
        <div>
          <h1 className="text-sm font-semibold">Message Bubble Gallery</h1>
          <p className="text-xs text-muted-foreground">每个场景对应一种 MessageBubble 渲染分支；逐个迭代 UI。</p>
        </div>
        <ThemeToggle />
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-[200px_1fr] gap-8 px-6 py-8">
        <aside className="sticky top-20 h-max space-y-1 text-xs">
          {SCENARIOS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {s.label}
            </a>
          ))}
        </aside>

        <main className="space-y-12">
          {SCENARIOS.map((scenario) => (
            <section key={scenario.id} id={scenario.id} className="scroll-mt-20 space-y-3">
              <div className="space-y-1 border-b border-border pb-2">
                <h2 className="text-sm font-semibold">{scenario.label}</h2>
                {scenario.note && <p className="text-xs text-muted-foreground">{scenario.note}</p>}
              </div>
              <div className="rounded-lg border border-border bg-card/30 p-4">
                <MessageList
                  messages={scenario.messages}
                  status={scenario.status ?? "ready"}
                  conversationId="debug"
                />
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
