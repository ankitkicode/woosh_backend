/**
 * Standard API Response Class
 * All successful responses follow this format
 */
export class ApiResponse<T = unknown> {
  public success: boolean;
  public statusCode: number;
  public message: string;
  public data: T;

  constructor(statusCode: number, message: string, data: T) {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }
}
