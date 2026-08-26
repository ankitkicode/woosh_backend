import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/generateToken';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        role: string;
        phoneNumber: string;
      };
    }
  }
}

/**
 * Middleware to authenticate all protected routes via Bearer JWT.
 */
export const protect = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Authorization header missing or malformed');
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  let user;
  if (decoded.role === 'admin' || decoded.role === 'superadmin' || decoded.role === 'super_admin') {
    const { Admin } = await import('../models/Admin');
    const admin = await Admin.findById(decoded.userId).select('_id role email isActive');
    if (admin) {
      user = { _id: admin._id, role: admin.role, email: admin.email, isActive: admin.isActive, phoneNumber: '' };
    }
  } else {
    user = await User.findById(decoded.userId).select('_id role phoneNumber isActive');
  }

  if (!user) throw new ApiError(401, 'User not found. Please log in again.');
  if (!user.isActive) throw new ApiError(403, 'Your account has been deactivated. Contact support.');

  req.user = { _id: user._id.toString(), role: user.role, phoneNumber: user.phoneNumber || '' };
  next();
});

/**
 * KYC Gate Middleware — blocks rider from accessing ride/status features
 * unless their KYC status is 'approved'.
 * Apply AFTER protect middleware on rider-only routes.
 */
export const kycGate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== 'rider') {
    return next(); // Non-riders skip KYC check
  }
  const { RiderProfile } = await import('../models/RiderProfile');
  const profile = await RiderProfile.findOne({ user: req.user._id }).select('kycStatus');

  if (!profile) {
    throw new ApiError(403, 'Rider profile not found. Please complete your KYC first.');
  }

  if (profile.kycStatus !== 'approved') {
    throw new ApiError(403, `KYC not approved. Current status: ${profile.kycStatus}. Please wait for admin approval before going online.`);
  }

  next();
});

