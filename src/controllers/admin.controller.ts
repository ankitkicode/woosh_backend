import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { Ride } from '../models/Ride';
import { Dispute } from '../models/Dispute';
import { RiderProfile } from '../models/RiderProfile';
import { WalletTransaction } from '../models/WalletTransaction';
import { SOSAlert } from '../models/SOSAlert';
import { InsuranceClaim } from '../models/InsuranceClaim';
import { KYCStatus, RideStatus, ComplaintStatus } from '../config/constants';
import { Admin } from '../models/Admin';
import { generateAccessToken, generateRefreshToken } from '../utils/generateToken';

/**
 * @route   POST /api/v1/admin/login
 * @desc    Login for admin panel
 * @access  Public
 */


export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  const admin = await Admin.findOne({ email: email.trim().toLowerCase() });
  if (!admin) {
    throw new ApiError(401, 'Email not found in database');
  }

  if (!admin.isActive) {
    throw new ApiError(403, 'Admin account is disabled');
  }

  const isPasswordValid = await admin.comparePassword(password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Password does not match');
  }

  admin.lastLogin = new Date();
  await admin.save();

  const tokenPayload = { userId: admin._id.toString(), role: admin.role };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  res.status(200).json(
    new ApiResponse(200, 'Admin logged in successfully', {
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
      accessToken,
      refreshToken,
    })
  );
});

/**
 * @route   GET /api/v1/admin/dashboard
 * @desc    Platform overview stats
 * @access  Protected (admin, super_admin)
 */
export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  const [
    totalPassengers, totalRiders, totalRides, activeRides,
    pendingKYC, openComplaints, completedRides,
  ] = await Promise.all([
    User.countDocuments({ role: 'passenger' } as Record<string, unknown>),
    User.countDocuments({ role: 'rider' } as Record<string, unknown>),
    Ride.countDocuments(),
    Ride.countDocuments({ status: { $in: [RideStatus.ACCEPTED, RideStatus.STARTED] } }),
    RiderProfile.countDocuments({ kycStatus: KYCStatus.UNDER_REVIEW }),
    Dispute.countDocuments({ status: ComplaintStatus.OPEN }),
    Ride.countDocuments({ status: RideStatus.COMPLETED }),
  ]);

  res.status(200).json(new ApiResponse(200, 'Dashboard fetched', {
    totalPassengers, totalRiders, totalRides, activeRides, pendingKYC, openComplaints, completedRides,
  }));
});

/**
 * @route   GET /api/v1/admin/riders/pending
 * @desc    Get riders awaiting KYC approval (paginated)
 * @access  Protected (admin)
 */
export const getPendingRiders = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 15;
  const skip = (page - 1) * limit;

  const [riders, total] = await Promise.all([
    RiderProfile.find({ kycStatus: KYCStatus.UNDER_REVIEW })
      .populate('user', 'name phoneNumber createdAt isActive')
      .skip(skip).limit(limit).sort({ createdAt: -1 }),
    RiderProfile.countDocuments({ kycStatus: KYCStatus.UNDER_REVIEW }),
  ]);

  res.status(200).json(new ApiResponse(200, 'Pending riders fetched', {
    riders, page, limit, total, totalPages: Math.ceil(total / limit),
  }));
});

/**
 * @route   GET /api/v1/admin/riders
 * @desc    Get all riders (paginated, filterable by status)
 * @access  Protected (admin)
 */
export const getAllRiders = asyncHandler(async (req: Request, res: Response) => {
  const { status, search } = req.query;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 15;
  const skip = (page - 1) * limit;

  const filter: any = {};
  if (status) filter.kycStatus = status;

  // For searching by name or phone, we need to find matching users first
  if (search) {
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search as string, $options: 'i' } },
        { phoneNumber: { $regex: search as string, $options: 'i' } }
      ]
    }).select('_id');
    const userIds = matchingUsers.map(u => u._id);
    filter.user = { $in: userIds };
  }

  const [riders, total] = await Promise.all([
    RiderProfile.find(filter)
      .populate('user', 'name phoneNumber createdAt isActive')
      .skip(skip).limit(limit).sort({ createdAt: -1 }),
    RiderProfile.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, 'All riders fetched', {
    riders, page, limit, total, totalPages: Math.ceil(total / limit),
  }));
});

/**
 * @route   GET /api/v1/admin/riders/:id
 * @desc    Get comprehensive details for a specific rider
 * @access  Protected (admin)
 */
export const getRiderById = asyncHandler(async (req: Request, res: Response) => {
  const profile = await RiderProfile.findById(req.params.id)
    .populate('user', '-password -sessions');

  if (!profile) {
    throw new ApiError(404, 'Rider profile not found');
  }

  // Fetch recent earnings/transactions
  const recentTransactions = await WalletTransaction.find({ user: profile.user._id })
    .sort({ createdAt: -1 }).limit(10);

  // Fetch recent rides
  const recentRides = await Ride.find({ rider: profile.user._id })
    .populate('passenger', 'name')
    .sort({ createdAt: -1 }).limit(5);

  res.status(200).json(new ApiResponse(200, 'Rider details fetched', {
    profile,
    recentTransactions,
    recentRides
  }));
});

/**
 * @route   PUT /api/v1/admin/riders/:id/approve
 * @desc    Approve a rider's KYC
 * @access  Protected (admin)
 */
export const approveRider = asyncHandler(async (req: Request, res: Response) => {
  const profile = await RiderProfile.findByIdAndUpdate(
    req.params.id,
    { kycStatus: KYCStatus.APPROVED, kycRejectionReason: undefined },
    { new: true }
  );
  if (!profile) throw new ApiError(404, 'Rider profile not found');
  res.status(200).json(new ApiResponse(200, 'Rider KYC approved', profile));
});

/**
 * @route   PUT /api/v1/admin/riders/:id/reject
 * @desc    Reject a rider's KYC
 * @access  Protected (admin)
 */
export const rejectRider = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body;
  if (!reason) throw new ApiError(400, 'Rejection reason is required');
  const profile = await RiderProfile.findByIdAndUpdate(
    req.params.id,
    { kycStatus: KYCStatus.REJECTED, kycRejectionReason: reason },
    { new: true }
  );
  if (!profile) throw new ApiError(404, 'Rider profile not found');
  res.status(200).json(new ApiResponse(200, 'Rider KYC rejected', profile));
});

/**
 * @route   GET /api/v1/admin/rides/active
 * @desc    Get all active rides for monitoring
 * @access  Protected (admin)
 */
export const getActiveRides = asyncHandler(async (req: Request, res: Response) => {
  const rides = await Ride.find({ status: { $in: [RideStatus.ACCEPTED, RideStatus.STARTED, RideStatus.RIDER_ARRIVED] } })
    .populate('passenger', 'name phoneNumber')
    .populate('rider', 'name phoneNumber')
    .sort({ createdAt: -1 });
  res.status(200).json(new ApiResponse(200, 'Active rides fetched', rides));
});

/**
 * @route   GET /api/v1/admin/disputes
 * @desc    Get all disputes (paginated, filterable by status)
 * @access  Protected (admin)
 */
export const getDisputes = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 15;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status as string;
  const [disputes, total] = await Promise.all([
    Dispute.find(filter).populate('raisedBy', 'name phoneNumber').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Dispute.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, 'Disputes fetched', {
    disputes, page, limit, total, totalPages: Math.ceil(total / limit),
  }));
});

/**
 * @route   PUT /api/v1/admin/disputes/:id/resolve
 * @desc    Resolve a dispute
 * @access  Protected (admin)
 */
export const resolveDispute = asyncHandler(async (req: Request, res: Response) => {
  const { adminNotes } = req.body;
  const dispute = await Dispute.findByIdAndUpdate(
    req.params.id,
    { status: ComplaintStatus.RESOLVED, adminNotes, resolvedAt: new Date() },
    { new: true }
  );
  if (!dispute) throw new ApiError(404, 'Dispute not found');
  res.status(200).json(new ApiResponse(200, 'Dispute resolved', dispute));
});

/**
 * @route   GET /api/v1/admin/users
 * @desc    Get all users (paginated, filterable by role)
 * @access  Protected (admin)
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { role, search } = req.query;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 15;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (role) filter.role = role as string;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phoneNumber: { $regex: search, $options: 'i' } }
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter).select('-sessions.refreshToken').sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, 'Users fetched', {
    users, page, limit, total, totalPages: Math.ceil(total / limit),
  }));
});

/**
 * @route   GET /api/v1/admin/sos
 * @desc    Get active SOS alerts
 * @access  Protected (admin)
 */
export const getSOSAlerts = asyncHandler(async (req: Request, res: Response) => {
  const alerts = await SOSAlert.find({ status: 'active' })
    .populate('triggeredBy', 'name phoneNumber')
    .sort({ createdAt: -1 });
  res.status(200).json(new ApiResponse(200, 'Active SOS alerts fetched', alerts));
});

/**
 * @route   GET /api/v1/admin/insurance
 * @desc    Get insurance claims
 * @access  Protected (admin)
 */
export const getInsuranceClaims = asyncHandler(async (req: Request, res: Response) => {
  const claims = await InsuranceClaim.find()
    .populate('userId', 'name phoneNumber')
    .sort({ createdAt: -1 });
  res.status(200).json(new ApiResponse(200, 'Insurance claims fetched', claims));
});

/**
 * @route   PUT /api/v1/admin/users/:id/ban
 * @desc    Ban (deactivate) a user
 * @access  Protected (admin)
 */
export const banUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  ).select('-sessions');
  if (!user) throw new ApiError(404, 'User not found');
  res.status(200).json(new ApiResponse(200, `User ${user.name || user.phoneNumber} has been banned`, user));
});

/**
 * @route   PUT /api/v1/admin/users/:id/unban
 * @desc    Unban (reactivate) a user
 * @access  Protected (admin)
 */
export const unbanUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: true },
    { new: true }
  ).select('-sessions');
  if (!user) throw new ApiError(404, 'User not found');
  res.status(200).json(new ApiResponse(200, `User ${user.name || user.phoneNumber} has been unbanned`, user));
});

/**
 * @route   PUT /api/v1/admin/sos/:id/resolve
 * @desc    Resolve an active SOS alert
 * @access  Protected (admin)
 */
export const resolveSOSAlert = asyncHandler(async (req: Request, res: Response) => {
  const { resolutionNotes } = req.body;
  const alert = await SOSAlert.findByIdAndUpdate(
    req.params.id,
    { status: 'resolved', resolvedBy: req.user?._id, resolutionNotes },
    { new: true }
  );
  if (!alert) throw new ApiError(404, 'SOS Alert not found');
  res.status(200).json(new ApiResponse(200, 'SOS Alert resolved', alert));
});
