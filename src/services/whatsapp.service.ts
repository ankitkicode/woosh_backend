import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

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
            language: { code: 'en_US' },
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

  /**
   * Send New Ride Request to Rider
   */
  async sendNewRideRequest(phoneNumber: string, pickup: string, drop: string): Promise<boolean> {
    if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) return false;
    try {
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : `91${phoneNumber}`;
      await axios.post(
        `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'template',
          template: {
            name: 'new_ride_request',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: pickup },
                  { type: 'text', text: drop }
                ],
              },
            ],
          },
        },
        { headers: { Authorization: `Bearer ${META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp new_ride_request:', error);
      return false;
    }
  },

  /**
   * Send Ride Accepted to Passenger
   */
  async sendRideAccepted(phoneNumber: string, riderName: string, vehicleInfo: string): Promise<boolean> {
    if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) return false;
    try {
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : `91${phoneNumber}`;
      await axios.post(
        `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'template',
          template: {
            name: 'ride_accepted',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: riderName },
                  { type: 'text', text: vehicleInfo }
                ],
              },
            ],
          },
        },
        { headers: { Authorization: `Bearer ${META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp ride_accepted:', error);
      return false;
    }
  },

  async sendRiderArrived(phoneNumber: string, otp: string): Promise<boolean> {
    if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) return false;
    try {
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : `91${phoneNumber}`;
      await axios.post(
        `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'template',
          template: {
            name: 'rider_arrived',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: otp }
                ],
              },
            ],
          },
        },
        { headers: { Authorization: `Bearer ${META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp rider_arrived:', error);
      return false;
    }
  },

  /**
   * Send Ride Started to Passenger
   */
  async sendRideStarted(phoneNumber: string): Promise<boolean> {
    if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) return false;
    try {
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : `91${phoneNumber}`;
      await axios.post(
        `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'template',
          template: {
            name: 'ride_started',
            language: { code: 'en' }
          },
        },
        { headers: { Authorization: `Bearer ${META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp ride_started:', error);
      return false;
    }
  },

  /**
   * Send Ride Completed to Passenger
   */
  async sendRideCompleted(phoneNumber: string, fare: number): Promise<boolean> {
    if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) return false;
    try {
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : `91${phoneNumber}`;
      await axios.post(
        `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'template',
          template: {
            name: 'ride_completed',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: fare.toString() }
                ],
              },
            ],
          },
        },
        { headers: { Authorization: `Bearer ${META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp ride_completed:', error);
      return false;
    }
  },

  /**
   * Send Welcome Message to new Rider
   */
  async sendWelcomeMessage(phoneNumber: string, name: string): Promise<boolean> {
    if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) return false;
    try {
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : `91${phoneNumber}`;
      await axios.post(
        `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'template',
          template: {
            name: 'welcome_rider',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: name }
                ],
              },
            ],
          },
        },
        { headers: { Authorization: `Bearer ${META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp welcome_rider:', error);
      return false;
    }
  },

  /**
   * Send Support Auto-Reply
   */
  async sendSupportConfirmation(phoneNumber: string, name: string, queryType: string): Promise<boolean> {
    if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) return false;
    try {
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : `91${phoneNumber}`;
      await axios.post(
        `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'template',
          template: {
            name: 'support_ticket_created',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: name },
                  { type: 'text', text: queryType }
                ],
              },
            ],
          },
        },
        { headers: { Authorization: `Bearer ${META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp support_ticket_created:', error);
      return false;
    }
  },

  /**
   * Send SOS Alert
   */
  async sendSOSAlert(phoneNumber: string, userName: string, locationUrl: string): Promise<boolean> {
    if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) return false;
    try {
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : `91${phoneNumber}`;
      await axios.post(
        `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'template',
          template: {
            name: 'sos_alert',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: userName },
                  { type: 'text', text: locationUrl }
                ],
              },
            ],
          },
        },
        { headers: { Authorization: `Bearer ${META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp sos_alert:', error);
      return false;
    }
  },

  /**
   * Send Admin Alert for New Rider Registration
   */
  async sendAdminRiderRegistrationAlert(adminPhone: string, riderName: string, riderPhone: string): Promise<boolean> {
    if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) return false;
    try {
      const formattedNumber = adminPhone.startsWith('+') ? adminPhone.substring(1) : `91${adminPhone}`;
      await axios.post(
        `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'template',
          template: {
            name: 'admin_rider_registration',
            language: { code: 'en_US' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: riderName },
                  { type: 'text', text: riderPhone }
                ],
              },
            ],
          },
        },
        { headers: { Authorization: `Bearer ${META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
      );
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp admin_rider_registration:', error);
      return false;
    }
  }
};
