import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { Notification } from '../models/Notification';
import { Broadcast } from '../models/Broadcast';
import { User } from '../models/User';
import { Admin } from '../models/Admin';
import { fcmService } from '../services/fcm.service';

/**
 * @route   GET /api/v1/notifications
 * @desc    Get notification history for current logged in user (Rider, Passenger, or Admin)
 * @access  Protected
 */
export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ user: req.user?._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments({ user: req.user?._id }),
    Notification.countDocuments({ user: req.user?._id, isRead: false }),
  ]);

  res.status(200).json(
    new ApiResponse(200, 'Notifications fetched successfully', {
      notifications,
      unreadCount,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    })
  );
});

/**
 * @route   GET /api/v1/notifications/unread-count
 * @desc    Get only unread notification count for badge icon on app header
 * @access  Protected
 */
export const getUnreadNotificationCount = asyncHandler(async (req: Request, res: Response) => {
  const unreadCount = await Notification.countDocuments({
    user: req.user?._id,
    isRead: false,
  });

  res.status(200).json(
    new ApiResponse(200, 'Unread count fetched', { unreadCount })
  );
});

/**
 * @route   PUT /api/v1/notifications/:id/read
 * @desc    Mark a specific notification as read
 * @access  Protected
 */
export const markNotificationAsRead = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const notification = await Notification.findOneAndUpdate(
    { _id: id, user: req.user?._id },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

  if (!notification) {
    throw new ApiError(404, 'Notification not found');
  }

  res.status(200).json(
    new ApiResponse(200, 'Notification marked as read', notification)
  );
});

/**
 * @route   PUT /api/v1/notifications/read-all
 * @desc    Mark all unread notifications as read for current user
 * @access  Protected
 */
export const markAllNotificationsAsRead = asyncHandler(async (req: Request, res: Response) => {
  await Notification.updateMany(
    { user: req.user?._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  res.status(200).json(
    new ApiResponse(200, 'All notifications marked as read', null)
  );
});

/**
 * @route   DELETE /api/v1/notifications/:id
 * @desc    Delete a notification from history
 * @access  Protected
 */
export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await Notification.findOneAndDelete({
    _id: id,
    user: req.user?._id,
  });

  if (!result) {
    throw new ApiError(404, 'Notification not found');
  }

  res.status(200).json(
    new ApiResponse(200, 'Notification deleted successfully', null)
  );
});

/**
 * @route   DELETE /api/v1/notifications/clear-all
 * @desc    Clear all notifications history for current user
 * @access  Protected
 */
export const clearAllNotifications = asyncHandler(async (req: Request, res: Response) => {
  await Notification.deleteMany({ user: req.user?._id });

  res.status(200).json(
    new ApiResponse(200, 'All notifications cleared', null)
  );
});

// =========================================================================
// ADMIN & SUPER ADMIN BROADCAST & PUSH MANAGEMENT (FULL ACCESS)
// =========================================================================

/**
 * @route   POST /api/v1/notifications/broadcast
 * @route   POST /api/v1/admin/notifications/broadcast
 * @desc    Send push broadcast to ALL, PASSENGERS, or RIDERS with city & platform targeting
 * @access  Protected (Admin, Super Admin)
 */
export const broadcastNotification = asyncHandler(async (req: Request, res: Response) => {
  const target = req.body.target || 'ALL';
  const title = (req.body.title || req.body.heading || req.body.subject || '').trim();
  const body = (req.body.body || req.body.message || req.body.content || req.body.text || '').trim();
  const { city, platform, type = 'ANNOUNCEMENT', imageUrl, data } = req.body;

  if (!title || !body) {
    throw new ApiError(400, 'Notification Title and Body are required');
  }

  // Fetch admin name for audit log
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

  // 1. Deliver via FCM service
  const result = await fcmService.broadcastNotification(
    target,
    title.trim(),
    body.trim(),
    city,
    payloadData,
    platform
  );

  // 2. Save Broadcast history record
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

  res.status(200).json(
    new ApiResponse(200, `Broadcast sent successfully to ${result.sentCount} active devices`, {
      broadcast: broadcastLog,
      target,
      city: city || 'ALL_CITIES',
      sentDevicesCount: result.sentCount,
    })
  );
});

/**
 * @route   GET /api/v1/notifications/broadcasts
 * @route   GET /api/v1/admin/notifications/broadcasts
 * @desc    Get sent broadcast notifications history (paginated)
 * @access  Protected (Admin, Super Admin)
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

  res.status(200).json(
    new ApiResponse(200, 'Broadcast history fetched successfully', {
      broadcasts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  );
});

/**
 * @route   POST /api/v1/notifications/send-user
 * @route   POST /api/v1/admin/notifications/send-user
 * @desc    Send direct push notification to specific user (by userId or phoneNumber)
 * @access  Protected (Admin, Super Admin)
 */
export const sendUserNotification = asyncHandler(async (req: Request, res: Response) => {
  let userId = req.body.userId || req.body.user || req.body.id;
  let phoneNumber = req.body.phoneNumber || req.body.phone || req.body.mobile;
  const title = (req.body.title || req.body.heading || req.body.subject || '').trim();
  const body = (req.body.body || req.body.message || req.body.content || req.body.text || '').trim();
  const { type = 'GENERAL', data, imageUrl } = req.body;

  if (!title || !body) {
    throw new ApiError(400, 'Title and message body are required');
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

  const isSent = await fcmService.sendToUser(userId, title.trim(), body.trim(), payloadData);

  res.status(200).json(
    new ApiResponse(
      200,
      isSent ? 'Direct notification sent successfully' : 'Notification saved to history (User has no active FCM push devices)',
      {
        userId,
        delivered: isSent,
      }
    )
  );
});

/**
 * @route   GET /api/v1/admin/notifications/all
 * @desc    Admin view all notifications across all users (with filters)
 * @access  Protected (Admin, Super Admin)
 */
export const getAdminAllNotifications = asyncHandler(async (req: Request, res: Response) => {
  const { type, isRead, search } = req.query;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const filter: any = {};
  if (type) filter.type = type;
  if (isRead !== undefined && isRead !== 'all') filter.isRead = isRead === 'true';

  if (search) {
    filter.$or = [
      { title: { $regex: search as string, $options: 'i' } },
      { body: { $regex: search as string, $options: 'i' } },
    ];
  }

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .populate('user', 'name phoneNumber role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(filter),
  ]);

  res.status(200).json(
    new ApiResponse(200, 'All notifications fetched', {
      notifications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  );
});

/**
 * @route   DELETE /api/v1/notifications/broadcasts/:id
 * @route   DELETE /api/v1/admin/notifications/broadcasts/:id
 * @desc    Delete a broadcast history record
 * @access  Protected (Admin, Super Admin)
 */
export const deleteBroadcast = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const broadcast = await Broadcast.findByIdAndDelete(id);
  if (!broadcast) {
    throw new ApiError(404, 'Broadcast record not found');
  }

  res.status(200).json(
    new ApiResponse(200, 'Broadcast record deleted successfully', null)
  );
});

