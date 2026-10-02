import Anthropic from "@anthropic-ai/sdk";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new HttpError(500, "anthropic_auth", "Claude rejected ANTHROPIC_API_KEY. Check the key in .env.local.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new HttpError(429, "anthropic_rate_limited", "Claude is rate limiting requests. Try again in a minute.");
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new HttpError(422, "anthropic_bad_request", `Claude couldn't process this input: ${error.message}`);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new HttpError(502, "anthropic_unreachable", "Couldn't reach the Claude API. Check your network connection.");
  }
  if (error instanceof Anthropic.APIError) {
    return new HttpError(502, "anthropic_error", `Claude API error (${error.status ?? "unknown"}): ${error.message}`);
  }
  return new HttpError(500, "internal_error", "Unexpected server error.");
}
