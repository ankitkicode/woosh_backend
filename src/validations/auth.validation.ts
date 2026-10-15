import { z } from 'zod';

export const sendOTPSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number'),
  role: z.enum(['passenger', 'rider', 'admin', 'super_admin']).optional(),
  action: z.enum(['login', 'register']).optional(),
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

export const setMpinSchema = z.object({
  mpin: z.string().regex(/^\d{4,6}$/, 'MPIN must be 4 to 6 digits'),
  confirmMpin: z.string().regex(/^\d{4,6}$/, 'Confirm MPIN must be 4 to 6 digits'),
}).refine((data) => data.mpin === data.confirmMpin, {
  message: 'MPIN and Confirm MPIN do not match',
  path: ['confirmMpin'],
});

export const verifyMpinSchema = z.object({
  mpin: z.string().regex(/^\d{4,6}$/, 'MPIN must be 4 to 6 digits'),
  phoneNumber: z.string().trim().regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit mobile number').optional(),
  deviceId: z.string().optional(),
});

export const changeMpinSchema = z.object({
  oldMpin: z.string().regex(/^\d{4,6}$/, 'Old MPIN must be 4 to 6 digits'),
  newMpin: z.string().regex(/^\d{4,6}$/, 'New MPIN must be 4 to 6 digits'),
  confirmNewMpin: z.string().regex(/^\d{4,6}$/, 'Confirm New MPIN must be 4 to 6 digits'),
}).refine((data) => data.newMpin === data.confirmNewMpin, {
  message: 'New MPIN and Confirm New MPIN do not match',
  path: ['confirmNewMpin'],
}).refine((data) => data.oldMpin !== data.newMpin, {
  message: 'New MPIN cannot be the same as old MPIN',
  path: ['newMpin'],
});

export const forgotMpinSchema = z.object({
  phoneNumber: z.string().trim().regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit mobile number'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
  newMpin: z.string().regex(/^\d{4,6}$/, 'New MPIN must be 4 to 6 digits'),
  confirmNewMpin: z.string().regex(/^\d{4,6}$/, 'Confirm New MPIN must be 4 to 6 digits'),
}).refine((data) => data.newMpin === data.confirmNewMpin, {
  message: 'New MPIN and Confirm New MPIN do not match',
  path: ['confirmNewMpin'],
});

