/** Every rejection the API layer can produce, with the HTTP status it maps to. */
export class ApiError extends Error {
  statusCode: number
  details?: unknown

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.details = details
  }
}

export const badRequest = (m: string, d?: unknown) => new ApiError(400, m, d)
export const unauthorized = (m = 'Missing or invalid API key') => new ApiError(401, m)
export const notFound = (m: string) => new ApiError(404, m)
export const conflict = (m: string, d?: unknown) => new ApiError(409, m, d)
/** Used for every validation failure that is about the *content* of a payload. */
export const unprocessable = (m: string, d?: unknown) => new ApiError(422, m, d)
