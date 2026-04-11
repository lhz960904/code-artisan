import { Hono } from "hono";
import { agentRoutes } from "./routes/agent";

const app = new Hono();

app.route("/", agentRoutes);

const PORT = Number(process.env.PORT ?? 3000);

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`agent-runner listening on port ${PORT}`);
