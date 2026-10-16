import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { OTP } from '../models/OTP';
import { RiderProfile } from '../models/RiderProfile';
import { PassengerProfile } from '../models/PassengerProfile';
import { generateOTP, getOTPExpiry } from '../utils/generateOTP';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/generateToken';
import { OTP_EXPIRY_MINUTES, UserRole, Gender } from '../config/constants';
import { smsService } from '../services/sms.service';
import { whatsappService } from '../services/whatsapp.service';
import { FaceService } from '../services/face.service';
import fs from 'fs';
import bcrypt from 'bcryptjs';

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

    if (action === 'login') {
      if (!existingUser || (existingUser.role !== UserRole.RIDER && existingUser.role !== UserRole.BOTH)) {
        throw new ApiError(403, 'Account not found. Please register as a rider first.');
      }
      // Note: We deliberately do not check RiderProfile here so users who dropped off 
      // during onboarding can login and resume their registration in the app.
    } else if (action === 'register') {
      if (existingUser && (existingUser.role === UserRole.RIDER || existingUser.role === UserRole.BOTH)) {
        const riderProfile = await RiderProfile.findOne({ user: existingUser._id });
        if (riderProfile) {
          throw new ApiError(403, 'You are already registered. Please login instead.');
        }
      }
    }
  }

  // Invalidate previous OTPs for this number
  await OTP.deleteMany({ phoneNumber });




  let otp = generateOTP(6);

  if (role === UserRole.RIDER && phoneNumber === '9876543210') {
    otp = '123456';
  } else if (role === UserRole.PASSENGER && phoneNumber === '9876543211') {
    otp = '123456';
  }

  const expiresAt = getOTPExpiry(OTP_EXPIRY_MINUTES);

  await OTP.create({ phoneNumber, otp, expiresAt });

  console.log(`\n========================================`);
  console.log(`📲 OTP for ${phoneNumber}: ${otp}`);
  console.log(`========================================\n`);

  // Use whatsappService to send the generated OTP (Skip for test numbers)
  if (phoneNumber !== '9876543210' && phoneNumber !== '9876543211') {
    try {
      await whatsappService.sendOTP(phoneNumber, otp);
    } catch (error) {
      console.error(`[WhatsApp] Failed to send OTP to ${phoneNumber}:`, error);
      throw new ApiError(500, 'Failed to send OTP via WhatsApp. Please try again later.');
    }
  } else {
    console.log(`[WhatsApp] Skipped sending OTP for test number ${phoneNumber}`);
  }

  res.status(200).json(
    new ApiResponse(200, 'OTP sent successfully', {
      phoneNumber,
    })
  );
});


export const verifyOTP = asyncHandler(async (req: Request, res: Response) => {
  const { phoneNumber, otp, role, deviceId, fcmToken, os, platform, deviceModel } = req.body;
  const clientPlatform = platform || os;

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
  let isNewUser = !user;

  if (!user) {
    user = await User.create({
      phoneNumber,
      role: role || UserRole.PASSENGER,
      gender: (role === UserRole.PASSENGER || !role) ? Gender.FEMALE : undefined,
      isFaceVerified: (role === UserRole.PASSENGER || !role) ? true : false,
    });
  } else if (user.role !== role && user.role !== UserRole.BOTH && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    // If the user already exists but with a different primary role, upgrade them to 'both'
    user.role = UserRole.BOTH;
    await user.save();
  }

  // Auto-provision PassengerProfile for passengers if not present
  // Note: Passengers reaching OTP verification have already passed the Splash screen female face verification gate!
  if (role === UserRole.PASSENGER || user.role === UserRole.PASSENGER || user.role === UserRole.BOTH) {
    let existingPassengerProfile = await PassengerProfile.findOne({ user: user._id });
    if (!existingPassengerProfile) {
      const prefix = user.name ? user.name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() : 'USER';
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      await PassengerProfile.create({
        user: user._id,
        referralCode: `WSH-${prefix}${randomSuffix}`,
        isWomenVerified: true,
        faceVerificationStatus: 'verified',
        faceVerifiedAt: new Date(),
      });
    } else if (!existingPassengerProfile.isWomenVerified) {
      existingPassengerProfile.isWomenVerified = true;
      existingPassengerProfile.faceVerificationStatus = 'verified';
      existingPassengerProfile.faceVerifiedAt = new Date();
      await existingPassengerProfile.save();
    }
  }

  // Handle Rider Profile drop-offs:
  // If the user is logging into the rider app but hasn't created a RiderProfile yet,
  // we treat them as a "new user" so the frontend automatically routes them to the registration screen.
  if (!isNewUser && (role === UserRole.RIDER || user.role === UserRole.RIDER || user.role === UserRole.BOTH)) {
    const riderProfile = await RiderProfile.findOne({ user: user._id });
    if (!riderProfile) {
      isNewUser = true;
    }
  }

  // Notify Admin on New Rider Registration
  if (isNewUser && (role === UserRole.RIDER || user.role === UserRole.RIDER || user.role === UserRole.BOTH)) {
    const riderName = user.name || 'New Rider';
    const primaryAdminPhone = "9011013612";

    // Send to primary hardcoded admin
    whatsappService.sendAdminRiderRegistrationAlert(primaryAdminPhone, riderName, user.phoneNumber).catch(err => {
      console.error('[WhatsApp] Error notifying primary admin about new rider:', err);
    });

    // Find other admins in DB to notify
    const admins = await User.find({ role: { $in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] } });
    admins.forEach(admin => {
      if (admin.phoneNumber && admin.phoneNumber !== primaryAdminPhone) {
        whatsappService.sendAdminRiderRegistrationAlert(admin.phoneNumber, riderName, user.phoneNumber).catch(err => {
          console.error('[WhatsApp] Error notifying admin about new rider:', err);
        });
      }
    });
  }

  // When generating the JWT, we use the role requested during login (passenger/rider)
  // so the app gets the correct scoped token, even if the DB says 'both'.
  const tokenPayload = { userId: user._id.toString(), role: role || user.role };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Manage Sessions
  if (deviceId) {
    const existingSessionIndex = user.sessions.findIndex(s => s.deviceId === deviceId);
    if (existingSessionIndex > -1) {
      // Update existing session
      user.sessions[existingSessionIndex].refreshToken = refreshToken;
      user.sessions[existingSessionIndex].fcmToken = fcmToken || user.sessions[existingSessionIndex].fcmToken;
      user.sessions[existingSessionIndex].os = clientPlatform || user.sessions[existingSessionIndex].os;
      user.sessions[existingSessionIndex].platform = clientPlatform || user.sessions[existingSessionIndex].platform;
      user.sessions[existingSessionIndex].deviceModel = deviceModel || user.sessions[existingSessionIndex].deviceModel;
      user.sessions[existingSessionIndex].lastActive = new Date();
    } else {
      // Create new session
      user.sessions.push({
        deviceId,
        fcmToken,
        os: clientPlatform,
        platform: clientPlatform,
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
      fcmToken,
      os: clientPlatform,
      platform: clientPlatform,
      deviceModel,
      lastActive: new Date()
    }];
  }

  await user.save();

  res.status(200).json(
    new ApiResponse(200, isNewUser ? 'Account created successfully' : 'Logged in successfully', {
      user: { 
        _id: user._id, 
        phoneNumber: user.phoneNumber, 
        role: user.role, 
        name: user.name,
        isMpinSet: Boolean(user.isMpinSet)
      },
      accessToken,
      refreshToken,
      isNewUser,
    })
  );
});




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

/**
 * @route   POST /api/v1/auth/set-mpin
 * @desc    Set 4-6 digit MPIN for app lock/unlock
 * @access  Protected
 */
export const setMpin = asyncHandler(async (req: Request, res: Response) => {
  const { mpin } = req.body;
  const userId = req.user?._id;

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Hash MPIN
  const hashedMpin = await bcrypt.hash(mpin, 10);

  user.mpin = hashedMpin;
  user.isMpinSet = true;
  user.mpinAttempts = 0;
  user.mpinLockedUntil = undefined;
  await user.save();

  res.status(200).json(new ApiResponse(200, 'MPIN set successfully', {
    isMpinSet: true,
  }));
});

/**
 * @route   POST /api/v1/auth/verify-mpin
 * @desc    Verify MPIN to quick-unlock the app
 * @access  Public (with phoneNumber/token) or Protected
 */
export const verifyMpin = asyncHandler(async (req: Request, res: Response) => {
  const { mpin, phoneNumber, deviceId } = req.body;

  // Identify user: either from authenticated token OR from phoneNumber
  let user: any = null;
  if (req.user?._id) {
    user = await User.findById(req.user._id).select('+mpin');
  } else if (phoneNumber) {
    user = await User.findOne({ phoneNumber }).select('+mpin');
  }

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (!user.isMpinSet || !user.mpin) {
    throw new ApiError(400, 'MPIN is not set for this account. Please set an MPIN first.');
  }

  // Check brute force lockout
  if (user.mpinLockedUntil && user.mpinLockedUntil > new Date()) {
    const remainingSeconds = Math.ceil((user.mpinLockedUntil.getTime() - Date.now()) / 1000);
    const remainingMinutes = Math.ceil(remainingSeconds / 60);
    throw new ApiError(429, `Too many wrong attempts. MPIN is locked. Please try again in ${remainingMinutes} minute(s).`);
  }

  // Verify MPIN
  const isMatch = await bcrypt.compare(mpin, user.mpin);
  if (!isMatch) {
    user.mpinAttempts = (user.mpinAttempts || 0) + 1;

    if (user.mpinAttempts >= 5) {
      user.mpinLockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lock
      user.mpinAttempts = 0;
      await user.save();
      throw new ApiError(429, 'Too many incorrect attempts. Account locked for 15 minutes.');
    }

    await user.save();
    const attemptsLeft = 5 - user.mpinAttempts;
    throw new ApiError(401, `Incorrect MPIN. ${attemptsLeft} attempt(s) remaining.`);
  }

  // Reset attempts on success
  user.mpinAttempts = 0;
  user.mpinLockedUntil = undefined;

  // Refresh auth tokens so user's session remains fresh
  const tokenPayload = { userId: user._id.toString(), role: user.role };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Update session if deviceId is provided
  const targetDeviceId = deviceId || 'generic-device';
  const existingSessionIndex = user.sessions.findIndex((s: any) => s.deviceId === targetDeviceId);
  if (existingSessionIndex > -1) {
    user.sessions[existingSessionIndex].refreshToken = refreshToken;
    user.sessions[existingSessionIndex].lastActive = new Date();
  } else {
    user.sessions.push({
      deviceId: targetDeviceId,
      refreshToken,
      lastActive: new Date(),
    });
  }

  await user.save();

  res.status(200).json(new ApiResponse(200, 'MPIN verified successfully. App unlocked.', {
    user: {
      _id: user._id,
      phoneNumber: user.phoneNumber,
      name: user.name,
      role: user.role,
      isMpinSet: true,
    },
    accessToken,
    refreshToken,
  }));
});

/**
 * @route   POST /api/v1/auth/change-mpin
 * @desc    Change existing MPIN using old MPIN
 * @access  Protected
 */
export const changeMpin = asyncHandler(async (req: Request, res: Response) => {
  const { oldMpin, newMpin } = req.body;
  const userId = req.user?._id;

  const user = await User.findById(userId).select('+mpin');
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (!user.isMpinSet || !user.mpin) {
    throw new ApiError(400, 'No MPIN is currently set. Please use Set MPIN instead.');
  }

  // Verify old MPIN
  const isMatch = await bcrypt.compare(oldMpin, user.mpin);
  if (!isMatch) {
    throw new ApiError(401, 'Incorrect old MPIN');
  }

  // Hash new MPIN
  const hashedNewMpin = await bcrypt.hash(newMpin, 10);
  user.mpin = hashedNewMpin;
  user.mpinAttempts = 0;
  user.mpinLockedUntil = undefined;
  await user.save();

  res.status(200).json(new ApiResponse(200, 'MPIN changed successfully', {
    isMpinSet: true,
  }));
});

/**
 * @route   POST /api/v1/auth/forgot-mpin
 * @desc    Reset forgotten MPIN using OTP verification
 * @access  Public
 */
export const forgotMpin = asyncHandler(async (req: Request, res: Response) => {
  const { phoneNumber, otp, newMpin } = req.body;

  const user = await User.findOne({ phoneNumber }).select('+mpin');
  if (!user) {
    throw new ApiError(404, 'User not found with this phone number');
  }

  // Verify OTP
  const validOtp = await OTP.findOne({
    phoneNumber,
    otp,
    expiresAt: { $gt: new Date() },
  });

  if (!validOtp) {
    throw new ApiError(400, 'Invalid or expired OTP');
  }

  // Delete used OTP
  await OTP.deleteMany({ phoneNumber });

  // Hash new MPIN
  const hashedNewMpin = await bcrypt.hash(newMpin, 10);
  user.mpin = hashedNewMpin;
  user.isMpinSet = true;
  user.mpinAttempts = 0;
  user.mpinLockedUntil = undefined;

  // Issue new session tokens
  const tokenPayload = { userId: user._id.toString(), role: user.role };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  await user.save();

  res.status(200).json(new ApiResponse(200, 'MPIN reset successfully. You are now logged in.', {
    user: {
      _id: user._id,
      phoneNumber: user.phoneNumber,
      name: user.name,
      role: user.role,
      isMpinSet: true,
    },
    accessToken,
    refreshToken,
  }));
});

/**
 * @route   PUT /api/v1/auth/fcm-token
 * @desc    Update or refresh device FCM Token and platform
 * @access  Protected
 */
export const updateFcmToken = asyncHandler(async (req: Request, res: Response) => {
  const { fcmToken, platform, os, deviceId, deviceModel } = req.body;
  const clientPlatform = platform || os;
  const user = await User.findById(req.user?._id);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (deviceId) {
    const existingIndex = user.sessions.findIndex(s => s.deviceId === deviceId);
    if (existingIndex > -1) {
      user.sessions[existingIndex].fcmToken = fcmToken;
      if (clientPlatform) {
        user.sessions[existingIndex].os = clientPlatform;
        user.sessions[existingIndex].platform = clientPlatform;
      }
      if (deviceModel) user.sessions[existingIndex].deviceModel = deviceModel;
      user.sessions[existingIndex].lastActive = new Date();
    } else {
      user.sessions.push({
        deviceId,
        fcmToken,
        os: clientPlatform,
        platform: clientPlatform,
        deviceModel,
        refreshToken: 'fcm-session-token',
        lastActive: new Date(),
      });
    }
  } else if (user.sessions.length > 0) {
    // Update the most recent active session
    user.sessions[user.sessions.length - 1].fcmToken = fcmToken;
    if (clientPlatform) {
      user.sessions[user.sessions.length - 1].os = clientPlatform;
      user.sessions[user.sessions.length - 1].platform = clientPlatform;
    }
    user.sessions[user.sessions.length - 1].lastActive = new Date();
  } else {
    user.sessions.push({
      deviceId: 'primary-device',
      fcmToken,
      os: clientPlatform,
      platform: clientPlatform,
      refreshToken: 'fcm-session-token',
      lastActive: new Date(),
    });
  }

  await user.save();

  res.status(200).json(new ApiResponse(200, 'FCM token and platform updated successfully', {
    fcmToken,
    platform: clientPlatform,
  }));
});

