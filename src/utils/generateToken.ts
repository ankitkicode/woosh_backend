import jwt from 'jsonwebtoken';
import { ApiError } from './ApiError';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'woosh_access_secret_change_in_prod';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'woosh_refresh_secret_change_in_prod';

export interface TokenPayload {
  userId: string;
  role: string;
}

/**
 * Generates a short-lived JWT access token (15 minutes).
 */
export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '7d' });
};

/**
 * Generates a long-lived JWT refresh token (30 days).
 */
export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '30d' });
};

/**
 * Verifies an access token. Throws ApiError if invalid/expired.
 */
export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, ACCESS_SECRET) as TokenPayload;
  } catch {
    throw new ApiError(401, 'Invalid or expired access token');
  }
};

/**
 * Verifies a refresh token. Throws ApiError if invalid/expired.
 */
export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, REFRESH_SECRET) as TokenPayload;
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token. Please log in again.');
  }
};
