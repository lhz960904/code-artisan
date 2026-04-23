import { Hono } from "hono";

const GREETINGS = [
  "Hello from Hono! Ready to ship something fast?",
  "Bun + Hono: runtime so fast, it's almost unfair.",
  "You clicked a button. A Hono route answered. Magic.",
  "Tailwind classes, shadcn components, Zustand store — all wired up.",
  "TanStack Query just called this endpoint. Check the Network tab.",
];

const app = new Hono();

app.get("/api/hello", (c) => {
  const message = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  return c.json({ message, timestamp: new Date().toISOString() });
});

if (typeof Bun !== "undefined") {
  const { serveStatic } = await import("hono/bun");
  app.use("/assets/*", serveStatic({ root: "./dist/client" }));
  app.get("*", async () => {
    const indexHtml = Bun.file("./dist/client/index.html");
    if (!(await indexHtml.exists())) {
      return new Response("Not built. Run `bun run build` first.", {
        status: 503,
      });
    }
    return new Response(indexHtml, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });
}

export default {
  port: Number(process.env.PORT ?? 5173),
  fetch: app.fetch,
};
