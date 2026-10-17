import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { Notification } from '../models/Notification';

/**
 * @route   GET /api/v1/notifications
 * @desc    Get notification history for current logged in user (Rider or Passenger)
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
