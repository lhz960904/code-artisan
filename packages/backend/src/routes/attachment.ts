import { Hono } from "hono";
import { uploadFile } from "../services/storage.js";
import { created, badRequest } from "../http/index.js";

const attachmentRouter = new Hono();

// Upload a file as an attachment
attachmentRouter.post("/", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return badRequest(c, "No file provided");
  }

  const result = await uploadFile(file);
  return created(c, result);
});

export { attachmentRouter };
