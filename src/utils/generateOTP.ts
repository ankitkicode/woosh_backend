import crypto from 'crypto';

/**
 * Generates a secure random OTP of the specified digit length.
 * @param digits - Number of digits (default 6)
 */
export const generateOTP = (digits = 6): string => {
  const max = Math.pow(10, digits);
  const min = Math.pow(10, digits - 1);
  return String(crypto.randomInt(min, max));
};

/**
 * Returns the OTP expiry time in minutes from now (as a Date).
 * @param minutes - Number of minutes until OTP expires (default 10)
 */
export const getOTPExpiry = (minutes = 10): Date => {
  return new Date(Date.now() + minutes * 60 * 1000);
};
