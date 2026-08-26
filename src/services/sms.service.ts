import axios from 'axios';

const SMS_API_URL = process.env.SMS_API_URL || '';
const SMS_API_KEY = process.env.SMS_API_KEY || '';
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || '';

export const smsService = {
  /**
   * Send an OTP via SMS
   */
  async sendOTP(phoneNumber: string, otp: string): Promise<boolean> {
    if (!SMS_API_URL || !SMS_API_KEY) {
      throw new Error('SMS Gateway credentials are not configured in .env');
    }

    try {
      // Example payload for a generic Indian SMS gateway (like MSG91 or Fast2SMS)
      await axios.post(
        SMS_API_URL,
        {
          sender_id: SMS_SENDER_ID,
          message: `Your Woosh OTP is ${otp}. Do not share this with anyone.`,
          route: 'v3',
          numbers: phoneNumber,
        },
        {
          headers: {
            'authorization': SMS_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );
      return true;
    } catch (error) {
      console.error('Error sending SMS:', error);
      return false;
    }
  },

  /**
   * Send a general SMS alert
   */
  async sendAlert(phoneNumber: string, message: string): Promise<boolean> {
    if (!SMS_API_URL || !SMS_API_KEY) {
      throw new Error('SMS Gateway credentials are not configured in .env');
    }

    try {
      await axios.post(
        SMS_API_URL,
        {
          sender_id: SMS_SENDER_ID,
          message: message,
          route: 'v3',
          numbers: phoneNumber,
        },
        {
          headers: {
            'authorization': SMS_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );
      return true;
    } catch (error) {
      console.error('Error sending SMS alert:', error);
      return false;
    }
  },
};
