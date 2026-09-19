/** Error with a stable machine code and an English message that is safe to show to users. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (code: string, message: string) => new ApiError(400, code, message);
export const unauthorized = (message = "Sign in to continue.") => new ApiError(401, "UNAUTHENTICATED", message);
export const forbidden = (code: string, message: string) => new ApiError(403, code, message);
export const notFound = (code: string, message: string) => new ApiError(404, code, message);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);
export const tooManyRequests = (message = "Too many requests. Try again shortly.") =>
  new ApiError(429, "RATE_LIMITED", message);
export const unavailable = (code: string, message: string) => new ApiError(503, code, message);
