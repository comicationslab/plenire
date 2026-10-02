export class AppError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429, public code: string, message?: string) {
    super(message ?? code);
  }
}
