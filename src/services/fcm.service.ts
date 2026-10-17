import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import path from 'path';
import fs from 'fs';

let isFirebaseInitialized = false;

// 1. Try FIREBASE_CREDENTIALS_JSON from .env first (secure production way)
if (process.env.FIREBASE_CREDENTIALS_JSON && process.env.FIREBASE_CREDENTIALS_JSON.trim()) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS_JSON);
    initializeApp({
      credential: cert(serviceAccount),
    });
    isFirebaseInitialized = true;
    console.log('✅ [Firebase Admin] Initialized successfully from FIREBASE_CREDENTIALS_JSON env');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin from JSON env:', error);
  }
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH && fs.existsSync(path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH))) {
  try {
    const filePath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    const serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount),
    });
    isFirebaseInitialized = true;
    console.log('✅ [Firebase Admin] Initialized successfully from file:', path.basename(filePath));
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin from file:', error);
  }
} else {
  console.warn('⚠️ [Firebase Admin] Service account credentials not found in env. Push notifications will be mocked/skipped.');
}

export const fcmService = {
  /**
   * Helper to format Android and iOS APNs payload with sound and high priority.
   * If channelId is provided or configured, it is attached; otherwise standard high-priority
   * notification is sent without enforcing a mandatory custom channel.
   */
  _buildMessage(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
    channelId?: string
  ) {
    const androidNotification: any = {
      sound: 'default',
      priority: 'high' as const,
    };

    const targetChannel = channelId || process.env.FIREBASE_NOTIFICATION_CHANNEL_ID;
    if (targetChannel) {
      androidNotification.channelId = targetChannel;
    }

    return {
      token,
      notification: { title, body },
      data: data || {},
      android: {
        priority: 'high' as const,
        notification: androidNotification,
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };
  },

  /**
   * Send Push Notification to single token
   */
  async sendPushNotification(token: string, title: string, body: string, data?: Record<string, string>): Promise<boolean> {
    if (!isFirebaseInitialized) {
      console.warn('[FCM] Skipped sendPushNotification: Firebase Admin not initialized.');
      return false;
    }

    try {
      await getMessaging().send(this._buildMessage(token, title, body, data));
      return true;
    } catch (error) {
      console.error('[FCM] Error sending single notification:', error);
      return false;
    }
  },

  /**
   * Send Multicast (to multiple tokens)
   */
  async sendMulticast(tokens: string[], title: string, body: string, data?: Record<string, string>): Promise<boolean> {
    if (!isFirebaseInitialized || tokens.length === 0) {
      return false;
    }

    try {
      const messages = tokens.map(token => this._buildMessage(token, title, body, data));
      // sendEach ensures sound and payload settings apply across both iOS and Android
      await getMessaging().sendEach(messages);
      return true;
    } catch (error) {
      console.error('[FCM] Error sending multicast:', error);
      return false;
    }
  },

  /**
   * Send Push Notification to all active devices of a single User & save to DB history
   */
  async sendToUser(userId: string, title: string, body: string, data?: Record<string, string>): Promise<boolean> {
    try {
      // 1. Save Notification record to DB history
      try {
        await Notification.create({
          user: userId,
          title,
          body,
          type: data?.type || 'GENERAL',
          data: data || {},
          isRead: false,
        });
      } catch (dbErr) {
        console.error('[FCM] Error saving notification to history:', dbErr);
      }

      // 2. Deliver live FCM push
      const user = await User.findById(userId);
      if (!user || !user.sessions || user.sessions.length === 0) return false;

      const tokens = user.sessions
        .map(session => session.fcmToken)
        .filter((token): token is string => Boolean(token));

      if (tokens.length === 0) return false;

      return await this.sendMulticast(tokens, title, body, data);
    } catch (error) {
      console.error('[FCM] Error in sendToUser:', error);
      return false;
    }
  },

  /**
   * Send Push Notification to multiple Users by IDs & save to DB history
   */
  async sendToUsers(userIds: string[], title: string, body: string, data?: Record<string, string>): Promise<boolean> {
    try {
      if (userIds.length === 0) return false;

      // 1. Save to DB history in bulk
      try {
        const notifDocs = userIds.map(uid => ({
          user: uid,
          title,
          body,
          type: data?.type || 'GENERAL',
          data: data || {},
          isRead: false,
        }));
        await Notification.insertMany(notifDocs);
      } catch (dbErr) {
        console.error('[FCM] Error bulk saving notifications to history:', dbErr);
      }

      // 2. Deliver live FCM push
      const users = await User.find({ _id: { $in: userIds } });
      const tokens: string[] = [];

      users.forEach(u => {
        if (u.sessions && u.sessions.length > 0) {
          u.sessions.forEach(s => {
            if (s.fcmToken) tokens.push(s.fcmToken);
          });
        }
      });

      if (tokens.length === 0) return false;
      return await this.sendMulticast(tokens, title, body, data);
    } catch (error) {
      console.error('[FCM] Error in sendToUsers:', error);
      return false;
    }
  },

  /**
   * Broadcast Notification by Target (ALL, PASSENGERS, RIDERS) and optional City
   */
  async broadcastNotification(
    target: 'ALL' | 'PASSENGERS' | 'RIDERS',
    title: string,
    body: string,
    city?: string,
    data?: Record<string, string>,
    platform?: 'ios' | 'android' | 'web'
  ): Promise<{ sentCount: number }> {
    try {
      const query: any = { isActive: true };

      if (target === 'PASSENGERS') {
        query.role = { $in: ['passenger', 'both'] };
      } else if (target === 'RIDERS') {
        query.role = { $in: ['rider', 'both'] };
      }

      if (city) {
        query.city = new RegExp(`^${city}$`, 'i');
      }

      const users = await User.find(query).select('_id sessions');
      const tokenSet = new Set<string>();
      const matchedUserIds: string[] = [];

      users.forEach(user => {
        matchedUserIds.push(user._id.toString());
        user.sessions?.forEach(session => {
          if (session.fcmToken) {
            if (platform) {
              const sessionPlatform = (session.platform || session.os || '').toLowerCase();
              if (sessionPlatform === platform.toLowerCase()) {
                tokenSet.add(session.fcmToken);
              }
            } else {
              tokenSet.add(session.fcmToken);
            }
          }
        });
      });

      // Save notification in history for all targeted users
      if (matchedUserIds.length > 0) {
        try {
          const bulkNotifs = matchedUserIds.map(uid => ({
            user: uid,
            title,
            body,
            type: data?.type || 'ANNOUNCEMENT',
            data: data || {},
            isRead: false,
          }));
          await Notification.insertMany(bulkNotifs, { ordered: false });
        } catch (dbErr) {
          console.error('[FCM] Error saving broadcast to history:', dbErr);
        }
      }

      const tokens = Array.from(tokenSet);
      if (tokens.length === 0) {
        return { sentCount: 0 };
      }

      // Batch send in chunks of 500 (Firebase max limit per batch)
      const batchSize = 500;
      let totalSent = 0;

      for (let i = 0; i < tokens.length; i += batchSize) {
        const chunk = tokens.slice(i, i + batchSize);
        await this.sendMulticast(chunk, title, body, data);
        totalSent += chunk.length;
      }

      return { sentCount: totalSent };
    } catch (error) {
      console.error('[FCM] Error in broadcastNotification:', error);
      return { sentCount: 0 };
    }
  },
};

