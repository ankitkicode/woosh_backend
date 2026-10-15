import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { PassengerProfile } from '../models/PassengerProfile';
import { ChildProfile } from '../models/ChildProfile';
import { Dispute } from '../models/Dispute';
import { SavedPlace } from '../models/SavedPlace';
import { SavedPaymentMethod } from '../models/SavedPaymentMethod';
import { SupportTicket } from '../models/SupportTicket';
import { MAX_CHILDREN_PER_ACCOUNT, RideStatus } from '../config/constants';
import { Ride } from '../models/Ride';

/**
 * Generate a referral code for a new passenger profile
 */
const generateReferralCode = (name?: string, phone?: string): string => {
  const prefix = name ? name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() : 'USER';
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `WSH-${prefix}${randomSuffix}`;
};

/**
 * @route   GET /api/v1/passenger/profile
 * @desc    Get current passenger's combined profile (User + PassengerProfile)
 * @access  Protected (passenger)
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const user = await User.findById(userId).select('-refreshToken');
  if (!user) throw new ApiError(404, 'Passenger not found');

  // Find or auto-initialize PassengerProfile
  let profile = await PassengerProfile.findOne({ user: userId });
  if (!profile) {
    profile = await PassengerProfile.create({
      user: userId,
      referralCode: generateReferralCode(user.name, user.phoneNumber),
    });
  }

  // Sync lifetime totalRides from completed rides if profile was lagging
  const rideCount = await Ride.countDocuments({
    passenger: userId,
    status: { $in: [RideStatus.COMPLETED, RideStatus.PAYMENT_COMPLETED] },
  });

  if (rideCount > profile.totalRides) {
    profile.totalRides = rideCount;
    await profile.save();
  }

  const userObj = user.toObject();

  res.status(200).json(
    new ApiResponse(200, 'Profile fetched', {
      ...userObj,
      profileImage: profile.profileImage || null,
      walletBalance: profile.walletBalance || 0,
      rating: profile.rating || 5.0,
      totalRatings: profile.totalRatings || 0,
      totalRides: profile.totalRides || 0,
      isWomenVerified: profile.isWomenVerified || false,
      faceVerificationStatus: profile.faceVerificationStatus || 'not_initiated',
      preferences: profile.preferences,
      safetySettings: profile.safetySettings,
      referralCode: profile.referralCode,
      referralEarnings: profile.referralEarnings || 0,
    })
  );
});

/**
 * @route   PUT /api/v1/passenger/profile
 * @desc    Update passenger profile (User details + Preferences + Safety Settings)
 * @access  Protected (passenger)
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const {
    name,
    email,
    gender,
    dateOfBirth,
    city,
    state,
    emergencyContacts,
    preferences,
    safetySettings,
  } = req.body;

  // 1. Update basic User fields
  const userUpdates: any = {};
  if (name !== undefined) userUpdates.name = name;
  if (email !== undefined) userUpdates.email = email;
  if (gender !== undefined) userUpdates.gender = gender;
  if (dateOfBirth !== undefined) userUpdates.dateOfBirth = dateOfBirth;
  if (city !== undefined) userUpdates.city = city;
  if (state !== undefined) userUpdates.state = state;
  if (emergencyContacts !== undefined) userUpdates.emergencyContacts = emergencyContacts;

  const user = await User.findByIdAndUpdate(userId, userUpdates, {
    new: true,
    runValidators: true,
  }).select('-refreshToken');

  // 2. Update PassengerProfile fields
  const profileUpdates: any = {};
  if (preferences) {
    for (const [key, val] of Object.entries(preferences)) {
      profileUpdates[`preferences.${key}`] = val;
    }
  }
  if (safetySettings) {
    for (const [key, val] of Object.entries(safetySettings)) {
      profileUpdates[`safetySettings.${key}`] = val;
    }
  }

  const profile = await PassengerProfile.findOneAndUpdate(
    { user: userId },
    { $set: profileUpdates },
    { new: true, upsert: true }
  );

  res.status(200).json(
    new ApiResponse(200, 'Profile updated', {
      ...(user ? user.toObject() : {}),
      profileImage: profile.profileImage || null,
      walletBalance: profile.walletBalance || 0,
      rating: profile.rating || 5.0,
      totalRatings: profile.totalRatings || 0,
      totalRides: profile.totalRides || 0,
      isWomenVerified: profile.isWomenVerified || false,
      faceVerificationStatus: profile.faceVerificationStatus || 'not_initiated',
      preferences: profile.preferences,
      safetySettings: profile.safetySettings,
      referralCode: profile.referralCode,
    })
  );
});

/**
 * @route   POST /api/v1/passenger/profile-image
 * @desc    Upload or update passenger avatar
 * @access  Protected (passenger)
 */
export const uploadProfileImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'Please upload an image file');
  }

  const profileImage = `/uploads/${req.file.filename}`;
  const profile = await PassengerProfile.findOneAndUpdate(
    { user: req.user?._id },
    { profileImage },
    { new: true, upsert: true }
  );

  res.status(200).json(
    new ApiResponse(200, 'Profile image updated successfully', {
      profileImage: profile.profileImage,
    })
  );
});

/**
 * @route   POST /api/v1/passenger/children
 * @desc    Add a child profile for the passenger
 * @access  Protected (passenger)
 */
export const addChildProfile = asyncHandler(async (req: Request, res: Response) => {
  const count = await ChildProfile.countDocuments({ passenger: req.user?._id });
  if (count >= MAX_CHILDREN_PER_ACCOUNT) {
    throw new ApiError(400, `Maximum ${MAX_CHILDREN_PER_ACCOUNT} child profiles allowed per account`);
  }
  const child = await ChildProfile.create({ ...req.body, passenger: req.user?._id });
  res.status(201).json(new ApiResponse(201, 'Child profile added', child));
});

/**
 * @route   GET /api/v1/passenger/children
 * @desc    Get all child profiles of the passenger
 * @access  Protected (passenger)
 */
export const getChildProfiles = asyncHandler(async (req: Request, res: Response) => {
  const children = await ChildProfile.find({ passenger: req.user?._id });
  res.status(200).json(new ApiResponse(200, 'Child profiles fetched', children));
});

/**
 * @route   DELETE /api/v1/passenger/children/:id
 * @desc    Delete a child profile
 * @access  Protected (passenger)
 */
export const deleteChildProfile = asyncHandler(async (req: Request, res: Response) => {
  const child = await ChildProfile.findOneAndDelete({ _id: req.params.id, passenger: req.user?._id });
  if (!child) throw new ApiError(404, 'Child profile not found');
  res.status(200).json(new ApiResponse(200, 'Child profile removed', null));
});

/**
 * @route   POST /api/v1/passenger/disputes
 * @desc    Submit a dispute
 * @access  Protected (passenger)
 */
export const submitDispute = asyncHandler(async (req: Request, res: Response) => {
  const dispute = await Dispute.create({
    raisedBy: req.user?._id,
    ride: req.body.rideId,
    category: req.body.category,
    subject: req.body.subject,
    description: req.body.description,
  });
  res.status(201).json(new ApiResponse(201, 'Dispute submitted', dispute));
});

// ==========================================
// SAVED PLACES CONTROLLERS
// ==========================================

/**
 * @route   GET /api/v1/passenger/saved-places
 * @desc    Get passenger's saved places
 * @access  Protected (passenger)
 */
export const getSavedPlaces = asyncHandler(async (req: Request, res: Response) => {
  const places = await SavedPlace.find({ user: req.user?._id }).sort({ createdAt: -1 });
  res.status(200).json(new ApiResponse(200, 'Saved places fetched', places));
});

/**
 * @route   POST /api/v1/passenger/saved-places
 * @desc    Add or replace a saved place (Home/Work/Other)
 * @access  Protected (passenger)
 */
export const addSavedPlace = asyncHandler(async (req: Request, res: Response) => {
  const { type, title, address, latitude, longitude, landmark } = req.body;
  const userId = req.user?._id;

  // If type is home or work, replace existing if found
  if (type === 'home' || type === 'work') {
    const existing = await SavedPlace.findOne({ user: userId, type });
    if (existing) {
      existing.title = title || (type === 'home' ? 'Home' : 'Work');
      existing.address = address;
      existing.latitude = latitude;
      existing.longitude = longitude;
      existing.landmark = landmark;
      res.status(200).json(new ApiResponse(200, `${type} place updated`, existing));
      return;
    }
  }

  const place = await SavedPlace.create({
    user: userId,
    type,
    title,
    address,
    latitude,
    longitude,
    landmark,
  });

  res.status(201).json(new ApiResponse(201, 'Saved place added', place));
});

/**
 * @route   PUT /api/v1/passenger/saved-places/:id
 * @desc    Update a saved place
 * @access  Protected (passenger)
 */
export const updateSavedPlace = asyncHandler(async (req: Request, res: Response) => {
  const place = await SavedPlace.findOneAndUpdate(
    { _id: req.params.id, user: req.user?._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!place) throw new ApiError(404, 'Saved place not found');
  res.status(200).json(new ApiResponse(200, 'Saved place updated', place));
});

/**
 * @route   DELETE /api/v1/passenger/saved-places/:id
 * @desc    Delete a saved place
 * @access  Protected (passenger)
 */
export const deleteSavedPlace = asyncHandler(async (req: Request, res: Response) => {
  const place = await SavedPlace.findOneAndDelete({ _id: req.params.id, user: req.user?._id });
  if (!place) throw new ApiError(404, 'Saved place not found');
  res.status(200).json(new ApiResponse(200, 'Saved place deleted', null));
});

// ==========================================
// SAVED PAYMENT METHODS CONTROLLERS
// ==========================================

/**
 * @route   GET /api/v1/passenger/payment-methods
 * @desc    Get passenger's saved payment methods
 * @access  Protected (passenger)
 */
export const getPaymentMethods = asyncHandler(async (req: Request, res: Response) => {
  const methods = await SavedPaymentMethod.find({ user: req.user?._id }).sort({ isDefault: -1, createdAt: -1 });
  res.status(200).json(new ApiResponse(200, 'Payment methods fetched', methods));
});

/**
 * @route   POST /api/v1/passenger/payment-methods
 * @desc    Save a new payment method (UPI or Card)
 * @access  Protected (passenger)
 */
export const addPaymentMethod = asyncHandler(async (req: Request, res: Response) => {
  const { type, upiId, cardLast4, cardBrand, isDefault } = req.body;
  const userId = req.user?._id;

  if (isDefault) {
    await SavedPaymentMethod.updateMany({ user: userId }, { isDefault: false });
  }

  const existingCount = await SavedPaymentMethod.countDocuments({ user: userId });
  const shouldBeDefault = isDefault || existingCount === 0;

  const method = await SavedPaymentMethod.create({
    user: userId,
    type,
    upiId,
    cardLast4,
    cardBrand,
    isDefault: shouldBeDefault,
    isVerified: true,
  });

  res.status(201).json(new ApiResponse(201, 'Payment method saved', method));
});

/**
 * @route   PUT /api/v1/passenger/payment-methods/:id/default
 * @desc    Set a payment method as default
 * @access  Protected (passenger)
 */
export const setDefaultPaymentMethod = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  await SavedPaymentMethod.updateMany({ user: userId }, { isDefault: false });

  const method = await SavedPaymentMethod.findOneAndUpdate(
    { _id: req.params.id, user: userId },
    { isDefault: true },
    { new: true }
  );
  if (!method) throw new ApiError(404, 'Payment method not found');

  res.status(200).json(new ApiResponse(200, 'Default payment method set', method));
});

/**
 * @route   DELETE /api/v1/passenger/payment-methods/:id
 * @desc    Delete a saved payment method
 * @access  Protected (passenger)
 */
export const deletePaymentMethod = asyncHandler(async (req: Request, res: Response) => {
  const method = await SavedPaymentMethod.findOneAndDelete({ _id: req.params.id, user: req.user?._id });
  if (!method) throw new ApiError(404, 'Payment method not found');
  res.status(200).json(new ApiResponse(200, 'Payment method removed', null));
});

// ==========================================
// PASSENGER SUPPORT TICKETS CONTROLLERS
// ==========================================

/**
 * @route   POST /api/v1/passenger/support/tickets
 * @desc    Create a passenger support ticket
 * @access  Protected (passenger)
 */
export const createSupportTicket = asyncHandler(async (req: Request, res: Response) => {
  const { rideId, category, subject, message, priority } = req.body;
  const ticketNumber = `WSH-SPT-${Date.now().toString().slice(-6)}`;

  const ticket = await SupportTicket.create({
    ticketNumber,
    passenger: req.user?._id,
    ride: rideId || undefined,
    category,
    subject,
    priority: priority || 'MEDIUM',
    status: 'OPEN',
    messages: [
      {
        sender: 'passenger',
        senderUser: req.user?._id,
        message,
        createdAt: new Date(),
      },
    ],
  });

  res.status(201).json(new ApiResponse(201, 'Support ticket created successfully', ticket));
});

/**
 * @route   GET /api/v1/passenger/support/tickets
 * @desc    Get passenger's support tickets
 * @access  Protected (passenger)
 */
export const getSupportTickets = asyncHandler(async (req: Request, res: Response) => {
  const tickets = await SupportTicket.find({ passenger: req.user?._id })
    .populate('ride', 'pickup drop fare finalFare status createdAt')
    .sort({ createdAt: -1 });

  res.status(200).json(new ApiResponse(200, 'Support tickets fetched', tickets));
});

/**
 * @route   GET /api/v1/passenger/support/tickets/:id
 * @desc    Get ticket details and conversation thread
 * @access  Protected (passenger)
 */
export const getSupportTicketById = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await SupportTicket.findOne({
    _id: req.params.id,
    passenger: req.user?._id,
  }).populate('ride', 'pickup drop fare finalFare status createdAt');

  if (!ticket) throw new ApiError(404, 'Support ticket not found');

  res.status(200).json(new ApiResponse(200, 'Support ticket details', ticket));
});

/**
 * @route   POST /api/v1/passenger/support/tickets/:id/message
 * @desc    Send a message in a support ticket
 * @access  Protected (passenger)
 */
export const addSupportTicketMessage = asyncHandler(async (req: Request, res: Response) => {
  const { message } = req.body;
  const ticket = await SupportTicket.findOne({
    _id: req.params.id,
    passenger: req.user?._id,
  });

  if (!ticket) throw new ApiError(404, 'Support ticket not found');
  if (ticket.status === 'CLOSED') {
    throw new ApiError(400, 'This support ticket has been closed');
  }

  ticket.messages.push({
    sender: 'passenger',
    senderUser: req.user?._id,
    message,
    createdAt: new Date(),
  });

  // Re-open if it was marked resolved
  if (ticket.status === 'RESOLVED') {
    ticket.status = 'IN_PROGRESS';
  }

  await ticket.save();

  res.status(200).json(new ApiResponse(200, 'Message sent successfully', ticket));
});

/**
 * @route   PUT /api/v1/passenger/support/tickets/:id/close
 * @desc    Passenger closes their resolved ticket
 * @access  Protected (passenger)
 */
export const closeSupportTicket = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await SupportTicket.findOneAndUpdate(
    { _id: req.params.id, passenger: req.user?._id },
    { status: 'CLOSED' },
    { new: true }
  );

  if (!ticket) throw new ApiError(404, 'Support ticket not found');

  res.status(200).json(new ApiResponse(200, 'Support ticket closed', ticket));
});
