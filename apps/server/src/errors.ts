import { DomainValidationError } from "@spire-lobby/shared";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "HTTP_ERROR",
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof DomainValidationError) {
    return new HttpError(400, error.message, "VALIDATION_ERROR");
  }
  if (error instanceof Error) {
    return new HttpError(500, error.message, "INTERNAL_ERROR");
  }
  return new HttpError(500, "服务器内部错误。", "INTERNAL_ERROR");
}
