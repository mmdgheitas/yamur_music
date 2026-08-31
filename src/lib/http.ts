import { NextResponse } from "next/server";

/** Structured, typed application error used across all route handlers. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export const unauthorized = (message = "Authentication required") =>
  new AppError(message, 401, "UNAUTHORIZED");
export const forbidden = (message = "You do not have permission for this action") =>
  new AppError(message, 403, "FORBIDDEN");
export const notFound = (message = "Resource not found") =>
  new AppError(message, 404, "NOT_FOUND");
export const badRequest = (message = "Invalid request payload") =>
  new AppError(message, 400, "BAD_REQUEST");
export const conflict = (message = "Resource already exists") =>
  new AppError(message, 409, "CONFLICT");

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("[api] unhandled error:", error);
  const message =
    error instanceof Error ? error.message : "Unexpected server error occurred";
  return NextResponse.json({ error: message, code: "INTERNAL_ERROR" }, { status: 500 });
}

/** Wraps a route handler with a single, consistent try/catch boundary. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return jsonError(error);
    }
  };
}

export function requireString(value: unknown, field: string, max = 240): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`Field "${field}" is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw badRequest(`Field "${field}" must be ${max} characters or fewer`);
  }
  return trimmed;
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : `list-${Date.now().toString(36)}`;
}
