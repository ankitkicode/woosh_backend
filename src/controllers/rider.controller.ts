import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { RiderProfile } from '../models/RiderProfile';
import { WalletTransaction } from '../models/WalletTransaction';
import { Ride } from '../models/Ride';
import { KYCStatus, DocumentType, UserRole, RideStatus } from '../config/constants';

/**
 * @route   GET /api/v1/rider/profile
 * @desc    Get current rider's profile
 * @access  Protected (rider)
 */
export const getRiderProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user?._id).select('-refreshToken');
  const riderProfile = await RiderProfile.findOne({ user: req.user?._id });
  res.status(200).json(new ApiResponse(200, 'Profile fetched', { user, riderProfile }));
});

/**
 * @route   PUT /api/v1/rider/profile
 * @desc    Update rider profile (name, vehicle details)
 * @access  Protected (rider)
 */
export const updateRiderProfile = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, gender, dateOfBirth, city, vehicleNumber, vehicleModel, vehicleColor } = req.body;
  
  const user = await User.findByIdAndUpdate(
    req.user?._id, 
    { name, email, gender, dateOfBirth, city }, 
    { new: true, runValidators: true }
  ).select('-refreshToken');

  const riderProfile = await RiderProfile.findOneAndUpdate(
    { user: req.user?._id },
    { vehicleNumber, vehicleModel, vehicleColor },
    { new: true, upsert: true, runValidators: true }
  );
  res.status(200).json(new ApiResponse(200, 'Profile updated', { user, riderProfile }));
});

/**
 * @route   POST /api/v1/rider/profile-image
 * @desc    Upload or update rider profile image
 * @access  Protected (rider)
 */
export const uploadProfileImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'Please upload an image file');
  }

  const profileImage = `/uploads/${req.file.filename}`;
  const riderProfile = await RiderProfile.findOneAndUpdate(
    { user: req.user?._id },
    { profileImage },
    { new: true, upsert: true }
  );

  res.status(200).json(new ApiResponse(200, 'Profile image updated successfully', { profileImage: riderProfile.profileImage }));
});

/**
 * @route   POST /api/v1/rider/kyc
 * @desc    Submit KYC documents (Aadhaar, DL, PAN, RC)
 * @access  Protected (rider)
 */
export const submitKYC = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  if (!files || Object.keys(files).length === 0) {
    throw new ApiError(400, 'At least one KYC document is required');
  }

  const { vehicleNumber } = req.body;
  let profile = await RiderProfile.findOne({ user: req.user?._id });
  
  const docTypes = [
    DocumentType.AADHAAR, DocumentType.DRIVING_LICENSE, DocumentType.PAN, DocumentType.RC_BOOK,
    DocumentType.VEHICLE_INSURANCE, DocumentType.PUC, DocumentType.POLICE_VERIFICATION,
    DocumentType.FACE_VERIFICATION, DocumentType.SELFIE_VERIFICATION
  ];

  if (profile) {
    // Partial update
    for (const docType of docTypes) {
      if (files[docType]?.[0]) {
        const existingDocIndex = profile.documents.findIndex(d => d.type === docType);
        const newDoc = { 
          type: docType, 
          url: `/uploads/${files[docType][0].filename}`, 
          status: 'PENDING' as 'PENDING',
          rejectionReason: undefined
        };
        
        if (existingDocIndex >= 0) {
          profile.documents[existingDocIndex] = newDoc;
        } else {
          profile.documents.push(newDoc);
        }
      }
    }
    profile.vehicleNumber = vehicleNumber || profile.vehicleNumber;
    
    // Check if any document is pending/rejected to update overall status
    const hasRejected = profile.documents.some(d => d.status === 'REJECTED');
    if (!hasRejected) {
      profile.kycStatus = KYCStatus.UNDER_REVIEW;
    }
    
    await profile.save();
  } else {
    // New profile
    const documents: { type: DocumentType; url: string; status: 'PENDING'; rejectionReason?: string }[] = [];
    for (const docType of docTypes) {
      if (files[docType]?.[0]) {
        documents.push({ 
          type: docType, 
          url: `/uploads/${files[docType][0].filename}`, 
          status: 'PENDING'
        });
      }
    }

    profile = await RiderProfile.create({
      user: req.user?._id,
      vehicleNumber,
      documents,
      kycStatus: KYCStatus.UNDER_REVIEW,
    });
    // Update user role to rider
    await User.findByIdAndUpdate(req.user?._id, { role: UserRole.RIDER });
  }

  res.status(200).json(new ApiResponse(200, 'KYC submitted. Under review.', { kycStatus: profile.kycStatus, documents: profile.documents }));
});

/**
 * @route   GET /api/v1/rider/kyc/status
 * @desc    Get KYC approval status
 * @access  Protected (rider)
 */
export const getKYCStatus = asyncHandler(async (req: Request, res: Response) => {
  const profile = await RiderProfile.findOne({ user: req.user?._id }).select('kycStatus kycRejectionReason safetyChecklist');
  if (!profile) throw new ApiError(404, 'Rider profile not found. Please submit KYC first.');
  res.status(200).json(new ApiResponse(200, 'KYC status fetched', profile));
});

/**
 * @route   PUT /api/v1/rider/safety-checklist
 * @desc    Submit daily safety checklist before going online
 * @access  Protected (rider)
 */
export const updateSafetyChecklist = asyncHandler(async (req: Request, res: Response) => {
  const { helmetAvailable, firstAidKitAvailable, sanitaryPadsAvailable, phoneBatteryCheck, faceVerified } = req.body;
  const profile = await RiderProfile.findOneAndUpdate(
    { user: req.user?._id },
    { 
      safetyChecklist: {
        helmetAvailable,
        firstAidKitAvailable,
        sanitaryPadsAvailable,
        phoneBatteryCheck,
        faceVerified,
        checkedAt: new Date()
      }
    },
    { new: true }
  );
  if (!profile) throw new ApiError(404, 'Rider profile not found');
  res.status(200).json(new ApiResponse(200, 'Safety checklist updated', profile.safetyChecklist));
});

/**
 * @route   PUT /api/v1/rider/status
 * @desc    Toggle rider online/offline status
 * @access  Protected (rider, approved KYC only)
 */
export const toggleOnlineStatus = asyncHandler(async (req: Request, res: Response) => {
  const profile = await RiderProfile.findOne({ user: req.user?._id });
  if (!profile) throw new ApiError(404, 'Rider profile not found');
  if (profile.kycStatus !== KYCStatus.APPROVED) {
    throw new ApiError(403, 'KYC not approved yet. You cannot go online until approval.');
  }

  if (!profile.isOnline) {
    // Going online: verify safety checklist
    const checklist = profile.safetyChecklist;
    if (!checklist || !checklist.checkedAt) {
      throw new ApiError(403, 'Please complete the safety checklist before going online.');
    }
    const today = new Date();
    if (checklist.checkedAt.toDateString() !== today.toDateString()) {
      throw new ApiError(403, 'Safety checklist expired. Please submit today\'s checklist.');
    }
    if (!checklist.helmetAvailable || !checklist.phoneBatteryCheck || !checklist.faceVerified) {
      throw new ApiError(403, 'Missing critical safety requirements to go online.');
    }
  }

  profile.isOnline = !profile.isOnline;
  await profile.save();

  res.status(200).json(new ApiResponse(200, `You are now ${profile.isOnline ? 'online' : 'offline'}`, {
    isOnline: profile.isOnline,
  }));
});

/**
 * @route   GET /api/v1/rider/earnings
 * @desc    Get rider earnings summary
 * @access  Protected (rider)
 */
export const getEarnings = asyncHandler(async (req: Request, res: Response) => {
  const profile = await RiderProfile.findOne({ user: req.user?._id }).select('totalEarnings walletBalance totalRides rating');
  if (!profile) throw new ApiError(404, 'Rider profile not found');

  const recentTransactions = await WalletTransaction.find({ user: req.user?._id })
    .sort({ createdAt: -1 }).limit(20);

  // Calculate daily and monthly earnings from Rides
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [dailyResult, monthlyResult] = await Promise.all([
    Ride.aggregate([
      { 
        $match: { 
          rider: new mongoose.Types.ObjectId(req.user?._id), 
          status: { $in: [RideStatus.COMPLETED, RideStatus.PAYMENT_COMPLETED] },
          rideEndedAt: { $gte: startOfDay }
        } 
      },
      { $group: { _id: null, total: { $sum: "$finalFare" }, count: { $sum: 1 } } }
    ]),
    Ride.aggregate([
      { 
        $match: { 
          rider: req.user?._id, 
          status: { $in: [RideStatus.COMPLETED, RideStatus.PAYMENT_COMPLETED] },
          rideEndedAt: { $gte: startOfMonth }
        } 
      },
      { $group: { _id: null, total: { $sum: "$finalFare" }, count: { $sum: 1 } } }
    ])
  ]);

  const todayEarnings = dailyResult[0]?.total || 0;
  const todayRides = dailyResult[0]?.count || 0;
  const monthlyEarnings = monthlyResult[0]?.total || 0;
  const monthlyRides = monthlyResult[0]?.count || 0;

  res.status(200).json(new ApiResponse(200, 'Earnings fetched', {
    summary: { 
      totalEarnings: profile.totalEarnings, 
      walletBalance: profile.walletBalance, 
      totalRides: profile.totalRides, 
      rating: profile.rating,
      todayEarnings,
      todayRides,
      monthlyEarnings,
      monthlyRides
    },
    recentTransactions,
  }));
});
