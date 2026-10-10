import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { RiderProfile } from '../models/RiderProfile';
import { WalletTransaction } from '../models/WalletTransaction';
import { Ride } from '../models/Ride';
import { PayoutRequest } from '../models/PayoutRequest';
import { BankAccount } from '../models/BankAccount';
import { KYCStatus, DocumentType, UserRole, RideStatus, WalletTransactionType } from '../config/constants';
import { whatsappService } from '../services/whatsapp.service';

/**
 * @route   GET /api/v1/rider/profile
 * @desc    Get current rider's profile
 * @access  Protected (rider)
 */
export const getRiderProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user?._id).select('-refreshToken');
  const riderProfile = await RiderProfile.findOne({ user: req.user?._id });
  
  let acceptanceRate = 0;
  if (riderProfile && riderProfile.totalRideRequests > 0) {
    acceptanceRate = Math.round((riderProfile.acceptedRides / riderProfile.totalRideRequests) * 100);
  }

  res.status(200).json(new ApiResponse(200, 'Profile fetched', { 
    user, 
    riderProfile: riderProfile ? { ...riderProfile.toObject(), acceptanceRate } : null 
  }));
});

/**
 * @route   PUT /api/v1/rider/profile
 * @desc    Update rider profile (name, vehicle details)
 * @access  Protected (rider)
 */
export const updateRiderProfile = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, gender, dateOfBirth, city, state, vehicleNumber, vehicleModel, vehicleColor, areas, emergencyContacts } = req.body;
  
  const existingProfile = await RiderProfile.findOne({ user: req.user?._id });
  const isNewProfile = !existingProfile;

  // Normalize emergency contacts since frontend might send 'phone' instead of 'phoneNumber'
  let normalizedContacts = emergencyContacts;
  if (Array.isArray(emergencyContacts)) {
    normalizedContacts = emergencyContacts.map((c: any) => ({
      name: c.name,
      phoneNumber: c.phoneNumber || c.phone || '',
    }));
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id, 
    { name, email, gender, dateOfBirth, city, state, emergencyContacts: normalizedContacts }, 
    { new: true, runValidators: true }
  ).select('-refreshToken');

  // Convert areas string to array if necessary, since frontend passes it as a single string initially or comma-separated
  let parsedAreas = areas;
  if (typeof areas === 'string') {
    parsedAreas = areas.split(',').map(a => a.trim()).filter(a => a.length > 0);
  }

  const riderProfile = await RiderProfile.findOneAndUpdate(
    { user: req.user?._id },
    { vehicleNumber, vehicleModel, vehicleColor, areas: parsedAreas },
    { new: true, upsert: true, runValidators: true }
  );

  // if (isNewProfile && user?.phoneNumber && user?.name) {
  //   await whatsappService.sendWelcomeMessage(user.phoneNumber, user.name);
  // }

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
  const profile = await RiderProfile.findOne({ user: req.user?._id }).select('totalEarnings walletBalance totalRides rating onlineHours');
  if (!profile) throw new ApiError(404, 'Rider profile not found');

  const recentTransactions = await WalletTransaction.find({ user: req.user?._id })
    .sort({ createdAt: -1 }).limit(20);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const riderId = new mongoose.Types.ObjectId(req.user?._id as string);

  const [dailyResult, weeklyResult, monthlyResult] = await Promise.all([
    Ride.aggregate([
      { $match: { rider: riderId, status: { $in: [RideStatus.COMPLETED, RideStatus.PAYMENT_COMPLETED] }, rideEndedAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$riderEarnings", "$finalFare"] } }, count: { $sum: 1 } } }
    ]),
    Ride.aggregate([
      { $match: { rider: riderId, status: { $in: [RideStatus.COMPLETED, RideStatus.PAYMENT_COMPLETED] }, rideEndedAt: { $gte: startOfWeek } } },
      { $group: { 
          _id: { $dayOfWeek: "$rideEndedAt" }, 
          total: { $sum: { $ifNull: ["$riderEarnings", "$finalFare"] } },
          count: { $sum: 1 }
        }
      }
    ]),
    Ride.aggregate([
      { $match: { rider: riderId, status: { $in: [RideStatus.COMPLETED, RideStatus.PAYMENT_COMPLETED] }, rideEndedAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$riderEarnings", "$finalFare"] } }, count: { $sum: 1 } } }
    ])
  ]);

  const todayEarnings = dailyResult[0]?.total || 0;
  const todayRides = dailyResult[0]?.count || 0;
  const monthlyEarnings = monthlyResult[0]?.total || 0;
  const monthlyRides = monthlyResult[0]?.count || 0;

  let weeklyEarnings = 0;
  let weeklyRides = 0;
  const dailyBreakdown = [0, 0, 0, 0, 0, 0, 0];
  
  weeklyResult.forEach(item => {
    const dayIndex = item._id === 1 ? 6 : item._id - 2;
    if(dayIndex >= 0 && dayIndex <= 6) {
      dailyBreakdown[dayIndex] = item.total;
    }
    weeklyEarnings += item.total;
    weeklyRides += item.count;
  });

  const cashDues = profile.walletBalance < 0 ? Math.abs(profile.walletBalance) : 0;

  res.status(200).json(new ApiResponse(200, 'Earnings fetched', {
    summary: { 
      totalEarnings: profile.totalEarnings, 
      walletBalance: profile.walletBalance, 
      cashDues,
      onlineHours: profile.onlineHours,
      totalRides: profile.totalRides, 
      rating: profile.rating,
      todayEarnings,
      todayRides,
      weeklyEarnings,
      weeklyRides,
      monthlyEarnings,
      monthlyRides,
      dailyBreakdown
    },
    recentTransactions,
  }));
});

/**
 * @route   POST /api/v1/rider/wallet/payout
 * @desc    Request a payout from wallet
 * @access  Protected (rider)
 */
export const requestPayout = asyncHandler(async (req: Request, res: Response) => {
  const { amount } = req.body;
  if (!amount || amount < 100) throw new ApiError(400, 'Minimum payout amount is ₹100');

  const riderProfile = await RiderProfile.findOne({ user: req.user?._id });
  if (!riderProfile) throw new ApiError(404, 'Rider profile not found');

  if (riderProfile.walletBalance < amount) {
    throw new ApiError(400, 'Insufficient wallet balance');
  }

  // Check for primary bank account
  const primaryAccount = await BankAccount.findOne({ rider: req.user?._id, isPrimary: true });
  if (!primaryAccount) {
    throw new ApiError(400, 'Please set a primary bank account before requesting a payout');
  }

  // Check if they already have a pending request
  const existingPending = await PayoutRequest.findOne({ rider: req.user?._id, status: 'pending' } as any);
  if (existingPending) {
    throw new ApiError(400, 'You already have a pending payout request');
  }

  // Deduct from wallet immediately
  riderProfile.walletBalance -= amount;
  await riderProfile.save();

  // Create Payout Request
  const payout = await PayoutRequest.create({
    rider: req.user?._id,
    amount,
    bankAccount: primaryAccount._id
  });

  // Create Wallet Transaction
  await WalletTransaction.create({
    user: req.user?._id,
    type: WalletTransactionType.PAYOUT, // Alternatively we could have a WITHDRAWAL enum
    amount: amount,
    description: `Payout Request`,
    referenceId: payout._id.toString(),
    balanceAfter: riderProfile.walletBalance
  });

  res.status(201).json(new ApiResponse(201, 'Payout requested successfully', payout));
});

/**
 * @route   POST /api/v1/rider/bank-accounts
 * @desc    Add a bank account
 * @access  Protected (rider)
 */
export const updateRiderSettings = asyncHandler(async (req: Request, res: Response) => {
  const { preferences, safetyPreferences } = req.body;
  
  const updateData: any = {};
  if (preferences) {
    for (const [key, value] of Object.entries(preferences)) {
      updateData[`preferences.${key}`] = value;
    }
  }
  if (safetyPreferences) {
    for (const [key, value] of Object.entries(safetyPreferences)) {
      updateData[`safetyPreferences.${key}`] = value;
    }
  }

  const profile = await RiderProfile.findOneAndUpdate(
    { user: req.user?._id },
    { $set: updateData },
    { new: true, runValidators: true }
  );

  if (!profile) throw new ApiError(404, 'Rider profile not found');

  res.status(200).json(new ApiResponse(200, 'Settings updated successfully', profile));
});

export const addEmergencyContact = asyncHandler(async (req: Request, res: Response) => {
  const { name, phoneNumber } = req.body;
  if (!name || !phoneNumber) throw new ApiError(400, 'Name and phone number are required');

  const user = await User.findById(req.user?._id);
  if (!user) throw new ApiError(404, 'User not found');
  
  if (user.emergencyContacts.length >= 5) {
    throw new ApiError(400, 'Maximum 5 emergency contacts allowed');
  }

  user.emergencyContacts.push({ name, phoneNumber });
  await user.save();
  
  res.status(201).json(new ApiResponse(201, 'Emergency contact added', user.emergencyContacts));
});

export const updateEmergencyContact = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, phoneNumber } = req.body;

  const user = await User.findOneAndUpdate(
    { _id: req.user?._id, 'emergencyContacts._id': id },
    { $set: { 'emergencyContacts.$.name': name, 'emergencyContacts.$.phoneNumber': phoneNumber } },
    { new: true }
  );

  if (!user) throw new ApiError(404, 'Contact not found');

  res.status(200).json(new ApiResponse(200, 'Emergency contact updated', user.emergencyContacts));
});

export const deleteEmergencyContact = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    { $pull: { emergencyContacts: { _id: id } } as any },
    { new: true }
  );

  res.status(200).json(new ApiResponse(200, 'Emergency contact deleted', user?.emergencyContacts));
});

export const addBankAccount = asyncHandler(async (req: Request, res: Response) => {
  const { accountHolderName, accountNumber, ifscCode, bankName, isPrimary } = req.body;
  if (!accountHolderName || !accountNumber || !ifscCode || !bankName) {
    throw new ApiError(400, 'All bank details are required');
  }

  // Check if this is the first account, make it primary automatically
  const count = await BankAccount.countDocuments({ rider: req.user?._id });
  const shouldBePrimary = count === 0 ? true : isPrimary;

  const account = await BankAccount.create({
    rider: req.user?._id,
    accountHolderName,
    accountNumber,
    ifscCode,
    bankName,
    isPrimary: shouldBePrimary,
  });

  res.status(201).json(new ApiResponse(201, 'Bank account added', account));
});

/**
 * @route   GET /api/v1/rider/bank-accounts
 * @desc    Get rider's bank accounts
 * @access  Protected (rider)
 */
export const getBankAccounts = asyncHandler(async (req: Request, res: Response) => {
  const accounts = await BankAccount.find({ rider: req.user?._id });
  res.status(200).json(new ApiResponse(200, 'Bank accounts fetched', accounts));
});

/**
 * @route   PUT /api/v1/rider/bank-accounts/:id/primary
 * @desc    Set bank account as primary
 * @access  Protected (rider)
 */
export const setPrimaryBankAccount = asyncHandler(async (req: Request, res: Response) => {
  const account = await BankAccount.findOne({ _id: req.params.id, rider: req.user?._id });
  if (!account) throw new ApiError(404, 'Bank account not found');

  account.isPrimary = true;
  await account.save(); // Pre-save hook will set others to false

  res.status(200).json(new ApiResponse(200, 'Primary bank account updated', account));
});
