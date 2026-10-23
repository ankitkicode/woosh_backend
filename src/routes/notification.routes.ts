import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
  broadcastNotification,
  getBroadcastHistory,
  sendUserNotification,
  getAdminAllNotifications,
  deleteBroadcast,
} from '../controllers/notification.controller';

const router = Router();

router.use(protect);

// ==========================================
// BROADCAST & ADMIN PUSH (FULL ACCESS)
// ==========================================
router.post('/broadcast', broadcastNotification);
router.get('/broadcasts', getBroadcastHistory);
router.delete('/broadcasts/:id', deleteBroadcast);
router.post('/send-user', sendUserNotification);
router.get('/all', getAdminAllNotifications);

// ==========================================
// USER NOTIFICATION INBOX
// ==========================================
router.get('/', getNotifications);
router.get('/unread-count', getUnreadNotificationCount);
router.put('/read-all', markAllNotificationsAsRead);
router.put('/:id/read', markNotificationAsRead);
router.delete('/clear-all', clearAllNotifications);
router.delete('/:id', deleteNotification);

export default router;
