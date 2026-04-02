import { Hono } from "hono";
import { uploadFile } from "../services/storage.js";

const uploadRouter = new Hono();

uploadRouter.post("/", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "No file provided" }, 400);
  }

  try {
    const result = await uploadFile(file);
    return c.json(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return c.json({ error: message }, 400);
  }
});

export { uploadRouter };
