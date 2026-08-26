import axios from 'axios';

const META_WHATSAPP_TOKEN = process.env.META_WHATSAPP_TOKEN || '';
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '';
const META_WHATSAPP_TEMPLATE_NAME = process.env.META_WHATSAPP_TEMPLATE_NAME || 'ride_tracking';
const META_WHATSAPP_OTP_TEMPLATE = process.env.META_WHATSAPP_OTP_TEMPLATE || 'otp_verification';

export const whatsappService = {
  /**
   * Send Ride Tracking Link via WhatsApp
   */
  async sendRideTrackingLink(phoneNumber: string, trackingUrl: string): Promise<boolean> {
    if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) {
      throw new Error('Meta WhatsApp credentials are not configured in .env');
    }

    try {
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : `91${phoneNumber}`;
      
      await axios.post(
        `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'template',
          template: {
            name: META_WHATSAPP_TEMPLATE_NAME,
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: trackingUrl }],
              },
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${META_WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      return false;
    }
  },

  /**
   * Send OTP via WhatsApp Cloud API
   */
  async sendOTP(phoneNumber: string, otp: string): Promise<boolean> {
    if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) {
      throw new Error('Meta WhatsApp credentials are not configured in .env');
    }

    try {
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : `91${phoneNumber}`;
      
      await axios.post(
        `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'template',
          template: {
            name: META_WHATSAPP_OTP_TEMPLATE,
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: otp }],
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: otp }]
              }
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${META_WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp OTP:', error);
      return false;
    }
  },
};
