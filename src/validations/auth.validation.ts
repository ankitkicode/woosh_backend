import { z } from 'zod';

export const sendOTPSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number'),
});

export const verifyOTPSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
  role: z.enum(['passenger', 'rider', 'admin', 'super_admin']).optional(),
  deviceId: z.string().min(1, 'Device ID is required for session management').optional(),
  fcmToken: z.string().optional(),
  os: z.string().optional(),
  deviceModel: z.string().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  deviceId: z.string().min(1, 'Device ID is required').optional(),
});

export const logoutSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required').optional(),
});
