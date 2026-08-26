import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { UserRole } from '../config/constants';

/**
 * Role-based access control middleware.
 * Usage: router.get('/admin/dashboard', protect, authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN), controller)
 */
export const authorize = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, 'Not authenticated'));
    }
    if (!roles.includes(req.user.role as UserRole)) {
      return next(new ApiError(403, `Access denied. This route requires one of: [${roles.join(', ')}]`));
    }
    next();
  };
};
