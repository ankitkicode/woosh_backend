import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { User } from '../models/User';

// Initialize Firebase Admin only if service account is available
const FIREBASE_CREDENTIALS = process.env.FIREBASE_CREDENTIALS_JSON || '';
let isFirebaseInitialized = false;

if (FIREBASE_CREDENTIALS) {
  try {
    const serviceAccount = JSON.parse(FIREBASE_CREDENTIALS);
    initializeApp({
      credential: cert(serviceAccount),
    });
    isFirebaseInitialized = true;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
  }
}

export const fcmService = {
  /**
   * Send Push Notification
   */
  async sendPushNotification(token: string, title: string, body: string, data?: Record<string, string>): Promise<boolean> {
    if (!isFirebaseInitialized) {
      throw new Error('Firebase Admin is not initialized. Please configure FIREBASE_CREDENTIALS_JSON in .env');
    }

    try {
      await getMessaging().send({
        token,
        notification: { title, body },
        data,
      });
      return true;
    } catch (error) {
      console.error('Error sending FCM notification:', error);
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
      await getMessaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data,
      });
      return true;
    } catch (error) {
      console.error('Error sending FCM multicast:', error);
      return false;
    }
  },

  /**
   * Send Push Notification to all active devices of a User
   */
  async sendToUser(userId: string, title: string, body: string, data?: Record<string, string>): Promise<boolean> {
    try {
      const user = await User.findById(userId);
      if (!user || !user.sessions || user.sessions.length === 0) return false;

      // Extract all valid fcmTokens from active sessions
      const tokens = user.sessions
        .map(session => session.fcmToken)
        .filter((token): token is string => !!token);

      if (tokens.length === 0) return false;

      // Use multicast to send to all devices at once
      return await this.sendMulticast(tokens, title, body, data);
    } catch (error) {
      console.error('Error in sendToUser FCM:', error);
      return false;
    }
  },
};
