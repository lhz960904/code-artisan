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

export default app;
