import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { OTP } from '../models/OTP';
import { RiderProfile } from '../models/RiderProfile';
import { generateOTP, getOTPExpiry } from '../utils/generateOTP';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/generateToken';
import { OTP_EXPIRY_MINUTES, UserRole } from '../config/constants';
import { smsService } from '../services/sms.service';
import { whatsappService } from '../services/whatsapp.service';
import { FaceService } from '../services/face.service';
import fs from 'fs';

/**
 * @route   POST /api/v1/auth/verify-gender
 * @desc    Upload selfie to verify if the user is a female
 * @access  Public
 */
export const verifyGender = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'Selfie image is required.');
  }

  try {
    const result = await FaceService.verifyGender(req.file.path);
    
    // Clean up uploaded file after analysis
    fs.unlinkSync(req.file.path);

    if (result.isFemale) {
      res.status(200).json(new ApiResponse(200, result.message, { isFemale: true }));
    } else {
      res.status(403).json(new ApiResponse(403, result.message, { isFemale: false }));
    }
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    throw error;
  }
});

/**
 * @route   POST /api/v1/auth/send-otp
 * @desc    Send OTP to a given mobile number
 * @access  Public
 */
export const sendOTP = asyncHandler(async (req: Request, res: Response) => {
  const { phoneNumber, role, action } = req.body;

  if (!phoneNumber) {
    throw new ApiError(400, 'Phone number is required');
  }

  // Cross-role and login validation logic
  console.log(`[sendOTP] Role: ${role}, Action: ${action}, Phone: ${phoneNumber}`);
  if (role === UserRole.RIDER) {
    const existingUser = await User.findOne({ phoneNumber });
    console.log(`[sendOTP] Existing User: ${existingUser ? existingUser.role : 'NULL'}`);
    
    if (action === 'login') {
      if (!existingUser || existingUser.role !== UserRole.RIDER) {
        throw new ApiError(403, 'You must complete registration first.');
      }
      const riderProfile = await RiderProfile.findOne({ user: existingUser._id });
      if (!riderProfile) {
        throw new ApiError(403, 'You must complete registration first.');
      }
    } else if (action === 'register') {
      if (existingUser && existingUser.role === UserRole.PASSENGER) {
        throw new ApiError(403, 'This number is already registered as a Passenger. Please use a different number for Rider registration.');
      }
      // If user exists and is a rider, they should login, not register.
      if (existingUser && existingUser.role === UserRole.RIDER) {
        throw new ApiError(403, 'You are already registered. Please login instead.');
      }
    }
  }

  // Invalidate previous OTPs for this number
  await OTP.deleteMany({ phoneNumber });

  const otp = generateOTP(6);
  const expiresAt = getOTPExpiry(OTP_EXPIRY_MINUTES);

  await OTP.create({ phoneNumber, otp, expiresAt });

  console.log(`\n========================================`);
  console.log(`📲 OTP for ${phoneNumber}: ${otp}`);
  console.log(`========================================\n`);

  // Use whatsappService to send the generated OTP
  await whatsappService.sendOTP(phoneNumber, otp);

  res.status(200).json(
    new ApiResponse(200, 'OTP sent successfully', {
      phoneNumber,
    })
  );
});

/**
 * @route   POST /api/v1/auth/verify-otp
 * @desc    Verify OTP and return access + refresh tokens
 * @access  Public
 */
export const verifyOTP = asyncHandler(async (req: Request, res: Response) => {
  const { phoneNumber, otp, role, deviceId, fcmToken, os, deviceModel } = req.body;

  const otpRecord = await OTP.findOne({ phoneNumber });
  if (!otpRecord) throw new ApiError(400, 'OTP not found. Please request a new one.');
  if (new Date() > otpRecord.expiresAt) {
    await OTP.deleteOne({ _id: otpRecord._id });
    throw new ApiError(400, 'OTP has expired. Please request a new one.');
  }
  if (otpRecord.otp !== otp) throw new ApiError(400, 'Invalid OTP. Please try again.');

  // Delete used OTP
  await OTP.deleteOne({ _id: otpRecord._id });

  // Find or create user
  let user = await User.findOne({ phoneNumber });
  const isNewUser = !user;

  if (!user) {
    user = await User.create({
      phoneNumber,
      role: role || UserRole.PASSENGER,
    });
  }

  const tokenPayload = { userId: user._id.toString(), role: user.role };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Manage Sessions
  if (deviceId) {
    const existingSessionIndex = user.sessions.findIndex(s => s.deviceId === deviceId);
    if (existingSessionIndex > -1) {
      // Update existing session
      user.sessions[existingSessionIndex].refreshToken = refreshToken;
      user.sessions[existingSessionIndex].fcmToken = fcmToken || user.sessions[existingSessionIndex].fcmToken;
      user.sessions[existingSessionIndex].os = os || user.sessions[existingSessionIndex].os;
      user.sessions[existingSessionIndex].deviceModel = deviceModel || user.sessions[existingSessionIndex].deviceModel;
      user.sessions[existingSessionIndex].lastActive = new Date();
    } else {
      // Create new session
      user.sessions.push({
        deviceId,
        fcmToken,
        os,
        deviceModel,
        refreshToken,
        lastActive: new Date()
      });
    }
  } else {
    // For legacy/testing support without deviceId, clear old sessions and create a generic one
    user.sessions = [{
      deviceId: 'generic-device',
      refreshToken,
      lastActive: new Date()
    }];
  }

  await user.save();

  res.status(200).json(
    new ApiResponse(200, isNewUser ? 'Account created successfully' : 'Logged in successfully', {
      user: { _id: user._id, phoneNumber: user.phoneNumber, role: user.role, name: user.name },
      accessToken,
      refreshToken,
      isNewUser,
    })
  );
});

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Generate new access token using refresh token
 * @access  Public
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken: token, deviceId } = req.body;

  const decoded = verifyRefreshToken(token);
  const user = await User.findById(decoded.userId).select('+sessions.refreshToken');
  
  if (!user) {
    throw new ApiError(401, 'User not found.');
  }

  // Find the session - first try matching by refreshToken directly (most reliable)
  const targetDeviceId = deviceId || 'generic-device';
  let sessionIndex = user.sessions.findIndex(s => s.refreshToken === token);
  
  // Fallback: try matching by deviceId + refreshToken
  if (sessionIndex === -1) {
    sessionIndex = user.sessions.findIndex(s => s.deviceId === targetDeviceId && s.refreshToken === token);
  }

  if (sessionIndex === -1) {
    throw new ApiError(401, 'Invalid refresh token or session expired. Please log in again.');
  }

  const tokenPayload = { userId: user._id.toString(), role: user.role };
  const accessToken = generateAccessToken(tokenPayload);
  const newRefreshToken = generateRefreshToken(tokenPayload);

  // Update session
  user.sessions[sessionIndex].refreshToken = newRefreshToken;
  user.sessions[sessionIndex].lastActive = new Date();
  await user.save();

  res.status(200).json(new ApiResponse(200, 'Token refreshed', { accessToken, refreshToken: newRefreshToken }));
});


/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user by invalidating refresh token
 * @access  Protected
 */

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { deviceId } = req.body;
  const targetDeviceId = deviceId || 'generic-device';
  
  await User.findByIdAndUpdate(req.user?._id, {
    $pull: { sessions: { deviceId: targetDeviceId } }
  });
  
  res.status(200).json(new ApiResponse(200, 'Logged out successfully', null));
});

/**
 * @route   POST /api/v1/auth/logout-all
 * @desc    Logout user from all linked devices
 * @access  Protected
 */

export const logoutAllDevices = asyncHandler(async (req: Request, res: Response) => {
  await User.findByIdAndUpdate(req.user?._id, {
    $set: { sessions: [] }
  });
  res.status(200).json(new ApiResponse(200, 'Logged out from all devices', null));
});

/**
 * @route   GET /api/v1/auth/sessions
 * @desc    Get all active linked devices/sessions
 * @access  Protected
 */
export const getActiveSessions = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user?._id);
  
  // Return sessions without refresh tokens
  const activeSessions = user?.sessions.map(s => ({
    deviceId: s.deviceId,
    os: s.os,
    deviceModel: s.deviceModel,
    lastActive: s.lastActive
  })) || [];

  res.status(200).json(new ApiResponse(200, 'Active sessions retrieved', activeSessions));
});
