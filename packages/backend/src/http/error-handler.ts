import type { ErrorHandler, NotFoundHandler } from "hono";
import { notFound, serverError } from "./response.js";

export const errorHandler: ErrorHandler = (err, c) => {
  console.error("[errorHandler] unhandled:", err);
  return serverError(c, err.message);
};

export const notFoundHandler: NotFoundHandler = (c) => notFound(c);
