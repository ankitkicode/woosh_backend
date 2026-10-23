import { Request, Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { getChartData, getTrendsData } from './dashboard.helper';
import { User } from '../models/User';
import { Ride } from '../models/Ride';
import { Dispute } from '../models/Dispute';
import { RiderProfile } from '../models/RiderProfile';
import { WalletTransaction } from '../models/WalletTransaction';
import { SOSAlert } from '../models/SOSAlert';
import { InsuranceClaim } from '../models/InsuranceClaim';
import { KYCStatus, RideStatus, ComplaintStatus, PaymentStatus, WalletTransactionType, UserRole } from '../config/constants';
import { ChildProfile } from '../models/ChildProfile';
import { Admin } from '../models/Admin';
import { generateAccessToken, generateRefreshToken } from '../utils/generateToken';
import { PayoutRequest } from '../models/PayoutRequest';
import { SupportTicket } from '../models/SupportTicket';
import { Broadcast } from '../models/Broadcast';
import { fcmService } from '../services/fcm.service';

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
    pendingKYC, openComplaints, completedRides, cancelledRides,
    activeSOS, onlineRidersCount, openSupportTickets,
    chartData, trends, revenueResult,
    onlineRiders, activeRidesList
  ] = await Promise.all([
    User.countDocuments({ role: { $in: ['passenger', 'both'] } } as Record<string, unknown>),
    User.countDocuments({ role: { $in: ['rider', 'both'] } } as Record<string, unknown>),
    Ride.countDocuments(),
    Ride.countDocuments({ status: { $in: [RideStatus.ACCEPTED, RideStatus.STARTED] } }),
    RiderProfile.countDocuments({ kycStatus: KYCStatus.UNDER_REVIEW }),
    Dispute.countDocuments({ status: ComplaintStatus.OPEN }),
    Ride.countDocuments({ status: RideStatus.COMPLETED }),
    Ride.countDocuments({ status: { $in: [RideStatus.RIDER_CANCELLED, RideStatus.PASSENGER_CANCELLED] } }),
    SOSAlert.countDocuments({ status: 'active' }),
    RiderProfile.countDocuments({ isOnline: true }),
    SupportTicket.countDocuments({ status: { $in: ['OPEN', 'IN_PROGRESS'] } }),
    getChartData(),
    getTrendsData(),
    Ride.aggregate([
      { $match: { status: { $in: [RideStatus.COMPLETED, RideStatus.PAYMENT_COMPLETED] }, finalFare: { $exists: true, $ne: null } } },
      { $group: { _id: null, totalRevenue: { $sum: '$finalFare' } } },
    ]),
    RiderProfile.find({ isOnline: true })
      .populate('user', 'name phoneNumber')
      .select('user vehicleNumber vehicleModel vehicleType currentLocation isOnline totalRides')
      .limit(10),
    Ride.find({ status: { $in: [RideStatus.ACCEPTED, RideStatus.STARTED] } })
      .populate('passenger', 'name phoneNumber')
      .populate('rider', 'name phoneNumber')
      .select('passenger rider pickup drop status estimatedFare finalFare createdAt')
      .limit(10),
  ]);

  const totalRevenue = (revenueResult[0]?.totalRevenue || 0);

  res.status(200).json(new ApiResponse(200, 'Dashboard fetched', {
    totalPassengers, totalRiders, totalRides, activeRides, pendingKYC,
    openComplaints, completedRides, cancelledRides, activeSOS,
    onlineRidersCount, openSupportTickets, totalRevenue,
    onlineRiders, activeRidesList,
    revenueData: chartData.revenueData,
    rideVolumeData: chartData.rideVolumeData,
    trends
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
      .populate('user', 'name phoneNumber email city createdAt isActive')
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
  const riderId = req.params.id as string;
  let profile = await RiderProfile.findById(riderId)
    .populate('user', '-password -sessions');

  if (!profile && mongoose.Types.ObjectId.isValid(riderId)) {
    profile = await RiderProfile.findOne({ user: riderId })
      .populate('user', '-password -sessions');
  }

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
  const riderId = req.params.id as string;
  let profile = await RiderProfile.findById(riderId);
  if (!profile && mongoose.Types.ObjectId.isValid(riderId)) {
    profile = await RiderProfile.findOne({ user: riderId });
  }

  if (!profile) throw new ApiError(404, 'Rider profile not found');

  // Auto-approve all documents if they are not already approved
  if (profile.documents && profile.documents.length > 0) {
    profile.documents.forEach((doc: any) => {
      doc.status = 'APPROVED';
      doc.isVerified = true;
      doc.rejectionReason = undefined;
    });
  }

  profile.kycStatus = KYCStatus.APPROVED;
  profile.kycRejectionReason = undefined;
  await profile.save();

  // Ensure associated User is active and has rider role
  const user = await User.findById(profile.user);
  if (user) {
    user.isActive = true;
    if (user.role === UserRole.PASSENGER) {
      user.role = UserRole.BOTH;
    }
    await user.save();
  }

  // Send push notification to rider
  try {
    await fcmService.sendToUser(
      profile.user.toString(),
      '🎉 KYC Application Approved!',
      'Congratulations! Your rider profile has been verified and approved. You can now go online and accept rides.',
      { type: 'KYC_STATUS', status: KYCStatus.APPROVED }
    );
  } catch (notifyErr) {
    console.error('FCM notify on approve error:', notifyErr);
  }

  res.status(200).json(new ApiResponse(200, 'Rider KYC approved successfully', profile));
});

/**
 * @route   PUT /api/v1/admin/riders/:id/reject
 * @desc    Reject a rider's KYC
 * @access  Protected (admin)
 */
export const rejectRider = asyncHandler(async (req: Request, res: Response) => {
  const reason = req.body.reason || req.body.rejectionReason;
  if (!reason || !reason.trim()) {
    throw new ApiError(400, 'Rejection reason is required');
  }

  const riderId = req.params.id as string;
  let profile = await RiderProfile.findById(riderId);
  if (!profile && mongoose.Types.ObjectId.isValid(riderId)) {
    profile = await RiderProfile.findOne({ user: riderId });
  }

  if (!profile) throw new ApiError(404, 'Rider profile not found');

  profile.kycStatus = KYCStatus.REJECTED;
  profile.kycRejectionReason = reason.trim();
  profile.isOnline = false; // Disallow online status immediately

  // If rider has documents, mark non-approved documents as rejected with reason so rider app knows which docs need resubmission
  if (profile.documents && profile.documents.length > 0) {
    profile.documents.forEach((doc: any) => {
      if (doc.status !== 'APPROVED') {
        doc.status = 'REJECTED';
        if (!doc.rejectionReason) {
          doc.rejectionReason = reason.trim();
        }
      }
    });
  }

  await profile.save();

  // Send push notification to rider
  try {
    await fcmService.sendToUser(
      profile.user.toString(),
      '⚠️ KYC Application Rejected',
      `Your rider KYC application was rejected. Reason: ${reason.trim()}. Please review and update your documents.`,
      { type: 'KYC_STATUS', status: KYCStatus.REJECTED, reason: reason.trim() }
    );
  } catch (notifyErr) {
    console.error('FCM notify on reject error:', notifyErr);
  }

  res.status(200).json(new ApiResponse(200, 'Rider KYC rejected successfully', profile));
});

/**
 * @route   DELETE /api/v1/admin/riders/:id
 * @desc    Delete a rider profile and associated user
 * @access  Protected (admin)
 */
export const deleteRider = asyncHandler(async (req: Request, res: Response) => {
  const riderId = req.params.id as string;
  let profile = await RiderProfile.findById(riderId);
  if (!profile && mongoose.Types.ObjectId.isValid(riderId)) {
    profile = await RiderProfile.findOne({ user: riderId });
  }
  if (!profile) throw new ApiError(404, 'Rider profile not found');

  // Delete the associated user
  await User.findByIdAndDelete(profile.user);

  // Delete the rider profile
  await RiderProfile.findByIdAndDelete(profile._id);

  res.status(200).json(new ApiResponse(200, 'Rider deleted successfully', null));
});

/**
 * @route   GET /api/v1/admin/payouts
 * @desc    Get all payout requests (paginated)
 * @access  Protected (admin)
 */
export const listPayoutRequests = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 15;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (status && status !== 'all') filter.status = status as string;

  const [payouts, total] = await Promise.all([
    PayoutRequest.find(filter)
      .populate('rider', 'name phoneNumber')
      .populate('bankAccount')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    PayoutRequest.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, 'Payout requests fetched', {
    payouts, page, limit, total, totalPages: Math.ceil(total / limit),
  }));
});

/**
 * @route   POST /api/v1/admin/payouts/bulk
 * @desc    Update multiple payout requests (Bulk Approve)
 * @access  Protected (Super Admin / Admin)
 */
export const bulkUpdatePayouts = asyncHandler(async (req: Request, res: Response) => {
  const { payoutIds, status, transactionRef, remarks } = req.body;
  if (!payoutIds || !Array.isArray(payoutIds) || payoutIds.length === 0) {
    throw new ApiError(400, 'Please provide an array of payout IDs');
  }

  // Find all pending payouts in this list
  const payouts = await PayoutRequest.find({ _id: { $in: payoutIds }, status: 'pending' } as any);

  const processedCount = payouts.length;
  if (processedCount === 0) {
    throw new ApiError(400, 'No valid pending payouts found for the provided IDs');
  }

  const { RiderProfile } = await import('../models/RiderProfile');

  for (const payout of payouts) {
    if (status === 'rejected') {
      const riderProfile = await RiderProfile.findOne({ user: payout.rider });
      if (riderProfile) {
        riderProfile.walletBalance += payout.amount;
        await riderProfile.save();

        await WalletTransaction.create({
          user: payout.rider,
          type: WalletTransactionType.TOPUP,
          amount: payout.amount,
          description: `Refund for rejected payout request`,
          referenceId: payout._id.toString(),
          balanceAfter: riderProfile.walletBalance
        });
      }
    }

    payout.status = status;
    payout.processedAt = new Date();
    payout.processedBy = req.user?._id as unknown as mongoose.Types.ObjectId;
    payout.remarks = remarks;
    payout.transactionRef = transactionRef;

    await payout.save();
  }

  res.status(200).json(new ApiResponse(200, `Successfully processed ${processedCount} payouts`, { processedCount }));
});

/**
 * @route   PUT /api/v1/admin/riders/:id/documents/:docType/status
 * @desc    Approve or reject a specific document
 * @access  Protected (admin)
 */
export const updateDocumentStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const docType = req.params.docType as string;
  const status = (req.body.status || '') as string;
  const reason = ((req.body.reason || req.body.rejectionReason || '') as string).trim();

  const upperStatus = status.toUpperCase();

  if (!['APPROVED', 'REJECTED'].includes(upperStatus)) {
    throw new ApiError(400, 'Invalid status. Must be APPROVED or REJECTED');
  }
  if (upperStatus === 'REJECTED' && !reason) {
    throw new ApiError(400, 'Rejection reason is required');
  }

  let profile = await RiderProfile.findById(id);
  if (!profile && mongoose.Types.ObjectId.isValid(id)) {
    profile = await RiderProfile.findOne({ user: id });
  }
  if (!profile) throw new ApiError(404, 'Rider profile not found');

  const docIndex = profile.documents.findIndex(d => d.type === docType);
  if (docIndex === -1) {
    throw new ApiError(404, 'Document not found');
  }

  profile.documents[docIndex].status = upperStatus as 'APPROVED' | 'REJECTED';
  profile.documents[docIndex].rejectionReason = upperStatus === 'REJECTED' ? reason : undefined;
  (profile.documents[docIndex] as any).isVerified = upperStatus === 'APPROVED';

  // Check overall KYC status based on documents
  const allApproved = profile.documents.length > 0 && profile.documents.every(d => d.status === 'APPROVED');
  const anyRejected = profile.documents.some(d => d.status === 'REJECTED');

  if (allApproved) {
    profile.kycStatus = KYCStatus.APPROVED;
    profile.kycRejectionReason = undefined;

    // Ensure associated user is active and has rider role
    const user = await User.findById(profile.user);
    if (user) {
      user.isActive = true;
      if (user.role === UserRole.PASSENGER) {
        user.role = UserRole.BOTH;
      }
      await user.save();
    }
  } else if (anyRejected) {
    profile.kycStatus = KYCStatus.REJECTED;
    profile.kycRejectionReason = reason || 'Some documents were rejected. Please review and re-upload.';
    profile.isOnline = false;
  } else {
    profile.kycStatus = KYCStatus.UNDER_REVIEW;
    profile.kycRejectionReason = undefined;
  }

  await profile.save();

  // Send push notification for document status update
  try {
    const formattedDocName = docType.replace(/_/g, ' ').toUpperCase();
    if (upperStatus === 'APPROVED') {
      await fcmService.sendToUser(
        profile.user.toString(),
        '📄 Document Approved',
        `Your document (${formattedDocName}) has been verified and approved.`,
        { type: 'DOC_STATUS', docType, status: 'APPROVED' }
      );
    } else {
      await fcmService.sendToUser(
        profile.user.toString(),
        '⚠️ Document Rejected',
        `Your document (${formattedDocName}) was rejected. Reason: ${reason}`,
        { type: 'DOC_STATUS', docType, status: 'REJECTED', reason }
      );
    }
  } catch (notifyErr) {
    console.error('FCM notify on doc status update error:', notifyErr);
  }

  res.status(200).json(new ApiResponse(200, `Document ${status.toLowerCase()} successfully`, profile));
});

/**
 * @route   GET /api/v1/admin/rides/active
 * @desc    Get all active rides for monitoring
 * @access  Protected (admin)
 */
export const getActiveRides = asyncHandler(async (req: Request, res: Response) => {
  const activeStatuses = [
    RideStatus.REQUESTED, RideStatus.RIDER_SEARCH, RideStatus.RIDER_ASSIGNED,
    RideStatus.ACCEPTED, RideStatus.RIDER_EN_ROUTE, RideStatus.RIDER_ARRIVED,
    RideStatus.OTP_VERIFICATION, RideStatus.STARTED, RideStatus.IN_PROGRESS
  ];

  const rides = await Ride.find({ status: { $in: activeStatuses } })
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
  if (role) {
    if (role === 'passenger' || role === 'rider') {
      filter.role = { $in: [role, 'both'] };
    } else {
      filter.role = role as string;
    }
  }
  if (req.query.isActive !== undefined && req.query.isActive !== 'all') {
    filter.isActive = req.query.isActive === 'true';
  }
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
 * @desc    Get SOS alerts (paginated, filterable by status)
 * @access  Protected (admin)
 */
export const getSOSAlerts = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 15;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (status && status !== 'all') filter.status = status as string;

  const [alerts, total] = await Promise.all([
    SOSAlert.find(filter)
      .populate('triggeredBy', 'name phoneNumber')
      .populate({
        path: 'rideId',
        select: '_id status pickup drop finalFare estimatedFare passenger rider',
        populate: [
          { path: 'passenger', select: 'name phoneNumber' },
          { path: 'rider', select: 'name phoneNumber' }
        ]
      })
      .populate('resolvedBy', 'name email')
      .sort({ createdAt: -1 }).skip(skip).limit(limit),
    SOSAlert.countDocuments(filter),
  ]);

  // Also get active count for badge
  const activeCount = await SOSAlert.countDocuments({ status: 'active' });

  res.status(200).json(new ApiResponse(200, 'SOS alerts fetched', {
    alerts, page, limit, total, totalPages: Math.ceil(total / limit), activeCount,
  }));
});

/**
 * @route   GET /api/v1/admin/insurance
 * @desc    Get insurance claims (paginated, filterable)
 * @access  Protected (admin)
 */
export const getInsuranceClaims = asyncHandler(async (req: Request, res: Response) => {
  const { status, claimType } = req.query;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 15;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (status && status !== 'all') filter.status = status as string;
  if (claimType && claimType !== 'all') filter.claimType = claimType as string;

  const [claims, total] = await Promise.all([
    InsuranceClaim.find(filter)
      .populate('userId', 'name phoneNumber')
      .populate('rideId', '_id status')
      .sort({ createdAt: -1 }).skip(skip).limit(limit),
    InsuranceClaim.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, 'Insurance claims fetched', {
    claims, page, limit, total, totalPages: Math.ceil(total / limit),
  }));
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

/**
 * @route   PUT /api/v1/admin/sos/:id/false-alarm
 * @desc    Mark an SOS alert as false alarm
 * @access  Protected (admin)
 */
export const markSOSFalseAlarm = asyncHandler(async (req: Request, res: Response) => {
  const { resolutionNotes } = req.body;
  const alert = await SOSAlert.findByIdAndUpdate(
    req.params.id,
    { status: 'false_alarm', resolvedBy: req.user?._id, resolutionNotes },
    { new: true }
  );
  if (!alert) throw new ApiError(404, 'SOS Alert not found');
  res.status(200).json(new ApiResponse(200, 'SOS Alert marked as false alarm', alert));
});

/**
 * @route   GET /api/v1/admin/rides
 * @desc    Get all rides (paginated, filterable by status, search, date)
 * @access  Protected (admin)
 */
export const getAllRides = asyncHandler(async (req: Request, res: Response) => {
  const { status, search, startDate, endDate } = req.query;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 15;
  const skip = (page - 1) * limit;

  const filter: any = {};

  // Status filter
  if (status && status !== 'all') {
    if (status === 'active') {
      filter.status = {
        $in: [
          RideStatus.REQUESTED, RideStatus.RIDER_SEARCH, RideStatus.RIDER_ASSIGNED,
          RideStatus.ACCEPTED, RideStatus.RIDER_EN_ROUTE, RideStatus.RIDER_ARRIVED,
          RideStatus.OTP_VERIFICATION, RideStatus.STARTED, RideStatus.IN_PROGRESS
        ]
      };
    } else if (status === 'completed') {
      filter.status = { $in: [RideStatus.COMPLETED, RideStatus.PAYMENT_COMPLETED, RideStatus.CLOSED] };
    } else if (status === 'cancelled') {
      filter.status = { $in: [RideStatus.RIDER_CANCELLED, RideStatus.PASSENGER_CANCELLED, RideStatus.NO_SHOW, RideStatus.TIMED_OUT] };
    } else {
      filter.status = status as string;
    }
  }

  // Date range filter
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate as string);
    if (endDate) filter.createdAt.$lte = new Date(endDate as string);
  }

  // Search by passenger or rider name
  if (search) {
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search as string, $options: 'i' } },
        { phoneNumber: { $regex: search as string, $options: 'i' } }
      ]
    }).select('_id');
    const userIds = matchingUsers.map(u => u._id);
    filter.$or = [{ passenger: { $in: userIds } }, { rider: { $in: userIds } }];
  }

  const [rides, total] = await Promise.all([
    Ride.find(filter)
      .populate('passenger', 'name phoneNumber')
      .populate('rider', 'name phoneNumber')
      .sort({ createdAt: -1 }).skip(skip).limit(limit),
    Ride.countDocuments(filter),
  ]);

  res.status(200).json(new ApiResponse(200, 'All rides fetched', {
    rides, page, limit, total, totalPages: Math.ceil(total / limit),
  }));
});

/**
 * @route   GET /api/v1/admin/rides/:id
 * @desc    Get detailed ride view
 * @access  Protected (admin)
 */
export const getRideById = asyncHandler(async (req: Request, res: Response) => {
  const ride = await Ride.findById(req.params.id)
    .populate('passenger', 'name phoneNumber email gender city emergencyContacts')
    .populate('rider', 'name phoneNumber')
    .populate('childProfile');

  if (!ride) throw new ApiError(404, 'Ride not found');

  // Get rider profile for vehicle info
  let riderProfile = null;
  if (ride.rider) {
    riderProfile = await RiderProfile.findOne({ user: ride.rider._id })
      .select('vehicleNumber vehicleModel vehicleColor vehicleType rating profileImage');
  }

  // Get SOS alerts for this ride
  const sosAlerts = await SOSAlert.find({ rideId: ride._id })
    .populate('triggeredBy', 'name phoneNumber');

  // Get disputes for this ride
  const disputes = await Dispute.find({ ride: ride._id })
    .populate('raisedBy', 'name phoneNumber');

  res.status(200).json(new ApiResponse(200, 'Ride details fetched', {
    ride, riderProfile, sosAlerts, disputes,
  }));
});

/**
 * @route   PUT /api/v1/admin/insurance/:id/status
 * @desc    Update insurance claim status
 * @access  Protected (admin)
 */
export const updateInsuranceClaimStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, amountApproved, adminNotes } = req.body;

  if (!['processing', 'approved', 'rejected'].includes(status)) {
    throw new ApiError(400, 'Invalid status. Must be processing, approved, or rejected');
  }

  const updateData: any = { status, adminNotes };
  if (status === 'approved' && amountApproved !== undefined) {
    updateData.amountApproved = amountApproved;
  }

  const claim = await InsuranceClaim.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true }
  ).populate('userId', 'name phoneNumber');

  if (!claim) throw new ApiError(404, 'Insurance claim not found');
  res.status(200).json(new ApiResponse(200, `Claim ${status} successfully`, claim));
});

/**
 * @route   GET /api/v1/admin/passengers/:id
 * @desc    Get passenger details with ride history and wallet
 * @access  Protected (admin)
 */
export const getPassengerById = asyncHandler(async (req: Request, res: Response) => {
  const passengerId = req.params.id as string;
  let user = await User.findById(passengerId).select('-sessions');
  const { PassengerProfile } = await import('../models/PassengerProfile');
  let passengerProfile = null;

  if (!user && mongoose.Types.ObjectId.isValid(passengerId)) {
    passengerProfile = await PassengerProfile.findById(passengerId);
    if (passengerProfile) {
      user = await User.findById(passengerProfile.user).select('-sessions');
    }
  }

  if (!user) throw new ApiError(404, 'Passenger account not found');

  if (!passengerProfile) {
    passengerProfile = await PassengerProfile.findOne({ user: user._id });
  }

  // Child profiles
  const childProfiles = await ChildProfile.find({ passenger: user._id });

  // Recent rides with full route details
  const recentRides = await Ride.find({ passenger: user._id })
    .populate('rider', 'name phoneNumber')
    .select('rider passenger status pickup drop finalFare estimatedFare paymentMethod createdAt')
    .sort({ createdAt: -1 })
    .limit(10);

  // Wallet transactions
  const transactions = await WalletTransaction.find({ user: user._id })
    .sort({ createdAt: -1 })
    .limit(10);

  // Stats & Spending
  const [totalRides, completedRides, cancelledRides, completedRidesList] = await Promise.all([
    Ride.countDocuments({ passenger: user._id }),
    Ride.countDocuments({ passenger: user._id, status: RideStatus.COMPLETED }),
    Ride.countDocuments({
      passenger: user._id,
      status: { $in: [RideStatus.PASSENGER_CANCELLED, RideStatus.RIDER_CANCELLED] },
    }),
    Ride.find({ passenger: user._id, status: RideStatus.COMPLETED }).select('finalFare estimatedFare'),
  ]);

  const totalSpent = completedRidesList.reduce((acc, r) => acc + (r.finalFare || r.estimatedFare || 0), 0);
  const walletBalance = passengerProfile?.walletBalance ?? 0;
  const rating = passengerProfile?.rating ?? 5.0;

  res.status(200).json(new ApiResponse(200, 'Passenger details fetched', {
    user,
    profile: passengerProfile,
    passengerProfile,
    childProfiles,
    recentRides,
    transactions,
    totalRides,
    completedRides,
    cancelledRides,
    totalSpent,
    walletBalance,
    rating,
  }));
});

/**
 * @route   DELETE /api/v1/admin/passengers/:id
 * @desc    Delete a passenger profile and associated user
 * @access  Protected (admin)
 */
export const deletePassenger = asyncHandler(async (req: Request, res: Response) => {
  const passengerId = req.params.id as string;
  let user = await User.findById(passengerId);
  const { PassengerProfile } = await import('../models/PassengerProfile');

  if (!user && mongoose.Types.ObjectId.isValid(passengerId)) {
    const profile = await PassengerProfile.findById(passengerId);
    if (profile) {
      user = await User.findById(profile.user);
    }
  }

  if (!user) throw new ApiError(404, 'Passenger account not found');

  // Delete passenger profile
  await PassengerProfile.deleteOne({ user: user._id });
  // Delete child profiles
  await ChildProfile.deleteMany({ passenger: user._id });
  // Delete user
  await User.findByIdAndDelete(user._id);

  res.status(200).json(new ApiResponse(200, 'Passenger deleted successfully', null));
});

/**
 * @route   PUT /api/v1/admin/payouts/:id
 * @desc    Approve or reject a payout request
 * @access  Protected (admin)
 */
export const updatePayoutRequest = asyncHandler(async (req: Request, res: Response) => {
  const { status, remarks, transactionRef } = req.body;

  if (!['approved', 'rejected', 'completed'].includes(status)) {
    throw new ApiError(400, 'Invalid status');
  }

  const payout = await PayoutRequest.findById(req.params.id);
  if (!payout) throw new ApiError(404, 'Payout request not found');
  if (payout.status !== 'pending') {
    throw new ApiError(400, `Payout is already ${payout.status}`);
  }

  payout.status = status;
  payout.remarks = remarks;
  payout.transactionRef = transactionRef;
  payout.processedAt = new Date();
  payout.processedBy = req.user?._id as unknown as mongoose.Types.ObjectId;

  if (status === 'rejected') {
    // Refund the amount to rider's wallet
    const riderProfile = await RiderProfile.findOne({ user: payout.rider });
    if (riderProfile) {
      riderProfile.walletBalance += payout.amount;
      await riderProfile.save();

      await WalletTransaction.create({
        user: payout.rider,
        type: WalletTransactionType.REFUND,
        amount: payout.amount,
        description: `Refund for rejected payout request`,
        referenceId: payout._id.toString(),
        balanceAfter: riderProfile.walletBalance
      });
    }
  }

  await payout.save();
  res.status(200).json(new ApiResponse(200, `Payout ${status}`, payout));
});

/**
 * @route   GET /api/v1/admin/riders/:id/wallet
 * @desc    Get wallet transactions for a specific rider
 * @access  Protected (admin)
 */
export const getRiderWalletHistory = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 15;
  const skip = (page - 1) * limit;
  const riderId = req.params.id;

  const riderProfile = await RiderProfile.findOne({ user: riderId }).populate('user', 'name phoneNumber');
  if (!riderProfile) throw new ApiError(404, 'Rider profile not found');

  const [transactions, total] = await Promise.all([
    WalletTransaction.find({ user: riderId })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    WalletTransaction.countDocuments({ user: riderId }),
  ]);

  res.status(200).json(
    new ApiResponse(200, 'Rider wallet history fetched', {
      walletBalance: riderProfile.walletBalance,
      totalEarnings: riderProfile.totalEarnings,
      transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    })
  );
});

/**
 * @route   GET /api/v1/admin/analytics
 * @desc    Fetch platform analytics (Revenue, Commission, Payouts, Rides)
 * @access  Protected (Super Admin / Admin)
 */
export const fetchAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const { Ride } = await import('../models/Ride');
  const { PayoutRequest } = await import('../models/PayoutRequest');

  // Total completed rides
  const totalRides = await Ride.countDocuments({ status: 'PAYMENT_COMPLETED' } as any);

  // Total Revenue & Commission
  const aggregation = await Ride.aggregate([
    { $match: { status: 'PAYMENT_COMPLETED' } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$finalFare" },
        totalCommission: { $sum: "$platformCommission" }
      }
    }
  ]);

  const totalRevenue = aggregation.length > 0 ? aggregation[0].totalRevenue : 0;
  const totalCommission = aggregation.length > 0 ? aggregation[0].totalCommission : 0;

  // Total Payouts Sent
  const payoutAgg = await PayoutRequest.aggregate([
    { $match: { status: 'completed' } },
    {
      $group: {
        _id: null,
        totalPayouts: { $sum: "$amount" }
      }
    }
  ]);

  const totalPayouts = payoutAgg.length > 0 ? payoutAgg[0].totalPayouts : 0;

  res.status(200).json(new ApiResponse(200, 'Analytics fetched successfully', {
    totalRides,
    totalRevenue,
    totalCommission,
    totalPayouts
  }));
});

/**
 * @route   POST /api/v1/admin/notifications/broadcast
 * @desc    Broadcast push notification to ALL, PASSENGERS, or RIDERS with optional city targeting
 * @access  Protected (Admin / Super Admin)
 */
export const broadcastNotification = asyncHandler(async (req: Request, res: Response) => {
  const target = req.body.target || 'ALL';
  const title = (req.body.title || req.body.heading || req.body.subject || '').trim();
  const body = (req.body.body || req.body.message || req.body.content || req.body.text || '').trim();
  const { city, platform, data, imageUrl, type = 'ANNOUNCEMENT' } = req.body;

  if (!title || !body) {
    throw new ApiError(400, 'Title and Body are required for notification');
  }

  let adminName = 'Admin';
  try {
    const admin = await Admin.findById(req.user?._id);
    if (admin) adminName = admin.name;
  } catch (e) {
    // quiet
  }

  const payloadData: Record<string, string> = {
    ...(data || {}),
    ...(imageUrl ? { imageUrl } : {}),
    type,
    sentBy: adminName,
    timestamp: new Date().toISOString(),
  };

  const result = await fcmService.broadcastNotification(
    target,
    title,
    body,
    city,
    payloadData,
    platform
  );

  const broadcastLog = await Broadcast.create({
    title: title.trim(),
    body: body.trim(),
    target,
    city: city || 'ALL_CITIES',
    platform: platform || 'ALL',
    type,
    imageUrl,
    data: payloadData,
    sentBy: req.user?._id,
    sentByName: adminName,
    sentCount: result.sentCount,
  });

  res.status(200).json(new ApiResponse(200, `Broadcast notification sent to ${result.sentCount} active devices`, {
    broadcast: broadcastLog,
    target,
    platform: platform || 'ALL_PLATFORMS',
    city: city || 'ALL_CITIES',
    title,
    sentDevicesCount: result.sentCount,
  }));
});

/**
 * @route   GET /api/v1/admin/notifications/broadcasts
 * @desc    Get broadcast notification history
 * @access  Protected (Admin / Super Admin)
 */
export const getBroadcastHistory = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const [broadcasts, total] = await Promise.all([
    Broadcast.find()
      .populate('sentBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Broadcast.countDocuments(),
  ]);

  res.status(200).json(new ApiResponse(200, 'Broadcast history fetched', {
    broadcasts,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }));
});

/**
 * @route   POST /api/v1/admin/notifications/send-user
 * @desc    Send push notification to a specific user (Passenger or Rider)
 * @access  Protected (Admin / Super Admin)
 */
export const sendUserNotification = asyncHandler(async (req: Request, res: Response) => {
  let userId = req.body.userId || req.body.user || req.body.id;
  let phoneNumber = req.body.phoneNumber || req.body.phone || req.body.mobile;
  const title = (req.body.title || req.body.heading || req.body.subject || '').trim();
  const body = (req.body.body || req.body.message || req.body.content || req.body.text || '').trim();
  const { type = 'GENERAL', data, imageUrl } = req.body;

  if (!title || !body) {
    throw new ApiError(400, 'Title and body are required');
  }

  if (!userId && phoneNumber) {
    const rawPhone = String(phoneNumber).trim();
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const user = await User.findOne({
      $or: [
        { phoneNumber: rawPhone },
        { phoneNumber: { $regex: cleanPhone.slice(-10) } },
      ],
    });
    if (!user) throw new ApiError(404, `User with phone ${phoneNumber} not found`);
    userId = user._id.toString();
  }

  if (!userId) {
    throw new ApiError(400, 'userId or phoneNumber is required');
  }

  const payloadData: Record<string, string> = {
    ...(data || {}),
    ...(imageUrl ? { imageUrl } : {}),
    type,
    sentBy: 'ADMIN',
    timestamp: new Date().toISOString(),
  };

  const isSent = await fcmService.sendToUser(userId, title, body, payloadData);

  res.status(200).json(new ApiResponse(200, isSent ? 'Notification sent successfully' : 'User has no active devices or FCM tokens', {
    userId,
    delivered: isSent,
  }));
});

/**
 * @route   DELETE /api/v1/admin/notifications/broadcasts/:id
 * @desc    Delete a broadcast history record
 * @access  Protected (Admin / Super Admin)
 */
export const deleteBroadcast = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const broadcast = await Broadcast.findByIdAndDelete(id);
  if (!broadcast) {
    throw new ApiError(404, 'Broadcast record not found');
  }

  res.status(200).json(new ApiResponse(200, 'Broadcast record deleted successfully', null));
});

// ==========================================
// ADMIN MANAGEMENT (Super Admin Only)
// ==========================================


/**
 * @route   GET /api/v1/admin/admins
 * @desc    List all admin accounts
 * @access  Protected (super_admin)
 */
export const listAdmins = asyncHandler(async (req: Request, res: Response) => {
  const admins = await Admin.find()
    .select('-passwordHash')
    .sort({ createdAt: -1 });
  res.status(200).json(new ApiResponse(200, 'Admins fetched', { admins }));
});

/**
 * @route   POST /api/v1/admin/admins
 * @desc    Create a new admin account
 * @access  Protected (super_admin)
 */
export const createAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name, role, phone } = req.body;

  if (!email || !password || !name) {
    throw new ApiError(400, 'Email, password, and name are required');
  }

  const existingAdmin = await Admin.findOne({ email: email.trim().toLowerCase() });
  if (existingAdmin) {
    throw new ApiError(409, 'Admin with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await Admin.create({
    email: email.trim().toLowerCase(),
    passwordHash,
    name: name.trim(),
    role: role || 'admin',
    phone: phone?.trim(),
    isActive: true,
  });

  const adminResponse = admin.toObject();
  delete (adminResponse as any).passwordHash;

  res.status(201).json(new ApiResponse(201, 'Admin created successfully', adminResponse));
});

/**
 * @route   PUT /api/v1/admin/admins/:id
 * @desc    Update admin details
 * @access  Protected (super_admin)
 */
export const updateAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, phone, role, password } = req.body;
  const adminId = req.params.id;

  const admin = await Admin.findById(adminId);
  if (!admin) throw new ApiError(404, 'Admin not found');

  if (name) admin.name = name.trim();
  if (email) admin.email = email.trim().toLowerCase();
  if (phone !== undefined) admin.phone = phone?.trim();
  if (role) admin.role = role;
  if (password) {
    admin.passwordHash = await bcrypt.hash(password, 12);
  }

  await admin.save();

  const adminResponse = admin.toObject();
  delete (adminResponse as any).passwordHash;

  res.status(200).json(new ApiResponse(200, 'Admin updated successfully', adminResponse));
});

/**
 * @route   PUT /api/v1/admin/admins/:id/toggle
 * @desc    Toggle admin active status
 * @access  Protected (super_admin)
 */
export const toggleAdmin = asyncHandler(async (req: Request, res: Response) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) throw new ApiError(404, 'Admin not found');

  // Prevent deactivating yourself
  if (admin._id.toString() === (req as any).user?._id?.toString()) {
    throw new ApiError(400, 'You cannot deactivate your own account');
  }

  admin.isActive = !admin.isActive;
  await admin.save();

  const adminResponse = admin.toObject();
  delete (adminResponse as any).passwordHash;

  res.status(200).json(new ApiResponse(200, `Admin ${admin.isActive ? 'activated' : 'deactivated'}`, adminResponse));
});

/**
 * @route   DELETE /api/v1/admin/admins/:id
 * @desc    Delete an admin account
 * @access  Protected (super_admin)
 */
export const deleteAdmin = asyncHandler(async (req: Request, res: Response) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) throw new ApiError(404, 'Admin not found');

  if (admin._id.toString() === (req as any).user?._id?.toString()) {
    throw new ApiError(400, 'You cannot delete your own account');
  }

  await Admin.findByIdAndDelete(req.params.id);
  res.status(200).json(new ApiResponse(200, 'Admin deleted successfully', null));
});


// ==========================================
// SUPPORT TICKET MANAGEMENT (Admin)
// ==========================================


/**
 * @route   GET /api/v1/admin/support/tickets
 * @desc    Get all support tickets (paginated, filterable)
 * @access  Protected (admin)
 */
export const getAdminSupportTickets = asyncHandler(async (req: Request, res: Response) => {
  const { status, priority, category, search } = req.query;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 15;
  const skip = (page - 1) * limit;

  const filter: any = {};
  if (status && status !== 'all') filter.status = status;
  if (priority && priority !== 'all') filter.priority = priority;
  if (category && category !== 'all') filter.category = category;

  if (search) {
    filter.$or = [
      { subject: { $regex: search, $options: 'i' } },
      { ticketNumber: { $regex: search, $options: 'i' } },
    ];
  }

  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter)
      .populate('passenger', 'name phoneNumber')
      .populate('ride', '_id status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    SupportTicket.countDocuments(filter),
  ]);

  // Counts by status for badges
  const [openCount, inProgressCount, resolvedCount, closedCount] = await Promise.all([
    SupportTicket.countDocuments({ status: 'OPEN' }),
    SupportTicket.countDocuments({ status: 'IN_PROGRESS' }),
    SupportTicket.countDocuments({ status: 'RESOLVED' }),
    SupportTicket.countDocuments({ status: 'CLOSED' }),
  ]);

  res.status(200).json(new ApiResponse(200, 'Support tickets fetched', {
    tickets, page, limit, total, totalPages: Math.ceil(total / limit),
    counts: { open: openCount, inProgress: inProgressCount, resolved: resolvedCount, closed: closedCount },
  }));
});

/**
 * @route   GET /api/v1/admin/support/tickets/:id
 * @desc    Get support ticket details with chat thread
 * @access  Protected (admin)
 */
export const getAdminSupportTicketById = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await SupportTicket.findById(req.params.id)
    .populate('passenger', 'name phoneNumber email')
    .populate('ride', '_id status pickup drop finalFare');

  if (!ticket) throw new ApiError(404, 'Support ticket not found');
  res.status(200).json(new ApiResponse(200, 'Support ticket details fetched', ticket));
});

/**
 * @route   POST /api/v1/admin/support/tickets/:id/reply
 * @desc    Admin replies to a support ticket
 * @access  Protected (admin)
 */
export const replySupportTicket = asyncHandler(async (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message?.trim()) throw new ApiError(400, 'Message is required');

  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw new ApiError(404, 'Support ticket not found');

  ticket.messages.push({
    sender: 'support_agent',
    senderUser: (req as any).user?._id,
    message: message.trim(),
    createdAt: new Date(),
  });

  if (ticket.status === 'OPEN') {
    ticket.status = 'IN_PROGRESS';
  }

  await ticket.save();
  res.status(200).json(new ApiResponse(200, 'Reply sent', ticket));
});

/**
 * @route   PUT /api/v1/admin/support/tickets/:id/status
 * @desc    Update support ticket status
 * @access  Protected (admin)
 */
export const updateSupportTicketStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, resolutionSummary } = req.body;

  if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
    throw new ApiError(400, 'Invalid status');
  }

  const updateData: any = { status };
  if (status === 'RESOLVED' || status === 'CLOSED') {
    updateData.resolvedAt = new Date();
    if (resolutionSummary) updateData.resolutionSummary = resolutionSummary;
  }

  const ticket = await SupportTicket.findByIdAndUpdate(req.params.id, updateData, { new: true })
    .populate('passenger', 'name phoneNumber');

  if (!ticket) throw new ApiError(404, 'Support ticket not found');
  res.status(200).json(new ApiResponse(200, `Ticket ${status.toLowerCase()}`, ticket));
});
