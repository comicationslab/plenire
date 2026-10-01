export class AppError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 422, public code: string, message?: string) {
    super(message ?? code);
  }
}
