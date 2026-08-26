import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';

/**
 * Validates request body against a Zod schema.
 * Returns 422 Unprocessable Entity if validation fails.
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
        return next(new ApiError(422, 'Validation failed', errors));
      }
      next(err);
    }
  };
};
