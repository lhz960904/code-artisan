import * as z from "zod";
import { BaseTool, type ToolRuntime } from "../base.js";

const schema = z.object({
  description: z
    .string()
    .describe(
      "Explain why you are starting this server in short words. ALWAYS PROVIDE THIS PARAMETER FIRST.",
    ),
  command: z.string().describe("Shell command to start the server."),
  port: z.number().describe("Port the server listens on."),
});

export class StartServerTool extends BaseTool<typeof schema> {
  name = "start_server";
  description =
    "Start a long-running server process in the background (e.g. node server.js, python -m http.server). Returns a public preview URL. Use this instead of bash for any command that starts a web server or long-running process.";
  schema = schema;

  protected async _call(
    runtime: ToolRuntime,
    input: z.infer<typeof schema>,
  ): Promise<string> {
    await runtime.sandbox.executeCommand(input.command, { background: true });
    await new Promise((r) => setTimeout(r, 2000));
    const url = runtime.sandbox.getHostUrl(input.port);
    return `Server started. Preview URL: ${url}`;
  }
}
