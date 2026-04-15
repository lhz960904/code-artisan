import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HttpStatus, type HttpStatusCode } from "./status.js";

export interface ApiSuccess<T> {
  statusCode: HttpStatusCode;
  data: T;
  message: string;
}

export interface ApiError {
  statusCode: HttpStatusCode;
  message: string;
  error: string;
}

const success = <T>(
  c: Context,
  statusCode: ContentfulStatusCode,
  data: T,
  message: string,
) => c.json<ApiSuccess<T>>({ statusCode: statusCode as HttpStatusCode, data, message }, statusCode);

const failure = (
  c: Context,
  statusCode: ContentfulStatusCode,
  message: string,
  error: string,
) => c.json<ApiError>({ statusCode: statusCode as HttpStatusCode, message, error }, statusCode);

// --- Success helpers ---

export const ok = <T>(c: Context, data: T, message = "Success") =>
  success(c, HttpStatus.OK, data, message);

export const created = <T>(c: Context, data: T, message = "Created") =>
  success(c, HttpStatus.CREATED, data, message);

export const noContent = (c: Context) => c.body(null, HttpStatus.NO_CONTENT);

// --- Error helpers ---

export const badRequest = (c: Context, message = "Bad Request") =>
  failure(c, HttpStatus.BAD_REQUEST, message, "Bad Request");

export const unauthorized = (c: Context, message = "Unauthorized") =>
  failure(c, HttpStatus.UNAUTHORIZED, message, "Unauthorized");

export const forbidden = (c: Context, message = "Forbidden") =>
  failure(c, HttpStatus.FORBIDDEN, message, "Forbidden");

export const notFound = (c: Context, message = "Not Found") =>
  failure(c, HttpStatus.NOT_FOUND, message, "Not Found");

export const conflict = (c: Context, message = "Conflict") =>
  failure(c, HttpStatus.CONFLICT, message, "Conflict");

export const serverError = (c: Context, message = "Internal Server Error") =>
  failure(c, HttpStatus.INTERNAL_SERVER_ERROR, message, "Internal Server Error");
