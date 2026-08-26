import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ApiError } from './ApiError';

/**
 * Wraps async route handlers to avoid repetitive try/catch blocks.
 * Any thrown ApiError or generic Error is forwarded to Express error handler.
 */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err: unknown) => {
      if (err instanceof ApiError) {
        next(err);
      } else if (err instanceof Error) {
        next(new ApiError(500, err.message));
      } else {
        next(new ApiError(500, 'An unknown internal error occurred'));
      }
    });
  };
};
