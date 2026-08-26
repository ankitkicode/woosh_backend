/**
 * Standard API Error Class
 * Extends native Error for consistent error handling across all modules
 */
export class ApiError extends Error {
  public statusCode: number;
  public errors: string[];
  public success: boolean;

  constructor(statusCode: number, message: string, errors: string[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.success = false;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
