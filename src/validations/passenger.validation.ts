import { z } from 'zod';

export const updatePassengerProfileSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  email: z.string().email().nullish().or(z.literal('')).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dateOfBirth: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  emergencyContacts: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(50),
        phoneNumber: z.string().trim().regex(/^[6-9]\d{9}$/, 'Invalid phone number'),
        relationship: z.string().trim().optional(),
        isPrimary: z.boolean().optional(),
        sendSosAlerts: z.boolean().optional(),
        autoShareRides: z.boolean().optional(),
      })
    )
    .max(5)
    .optional(),
  preferences: z
    .object({
      language: z.string().optional(),
      rideUpdates: z.boolean().optional(),
      offersAndPromotions: z.boolean().optional(),
      whatsappUpdates: z.boolean().optional(),
      hideFullNameFromRiders: z.boolean().optional(),
      defaultPaymentMethod: z.enum(['cash', 'upi', 'wallet']).optional(),
    })
    .optional(),
  safetySettings: z
    .object({
      autoShareEveryRide: z.boolean().optional(),
      rideCheck: z.boolean().optional(),
      nightRideProtection: z.boolean().optional(),
      recordAudioOnSOS: z.boolean().optional(),
      sosStopPin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits').optional(),
    })
    .optional(),
});

export const savedPlaceSchema = z.object({
  type: z.enum(['home', 'work', 'other']).default('other'),
  title: z.string().trim().min(1, 'Title is required').max(50),
  address: z.string().trim().min(3, 'Address is required').max(255),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  landmark: z.string().trim().max(100).optional(),
});

export const updateSavedPlaceSchema = savedPlaceSchema.partial();

export const savedPaymentMethodSchema = z.object({
  type: z.enum(['upi', 'card']),
  upiId: z.string().trim().toLowerCase().optional(),
  cardLast4: z.string().regex(/^\d{4}$/, 'cardLast4 must be 4 digits').optional(),
  cardBrand: z.string().trim().optional(),
  isDefault: z.boolean().optional(),
});

export const createSupportTicketSchema = z.object({
  rideId: z.string().optional(),
  category: z.enum([
    'fare_issue',
    'driver_behavior',
    'lost_item',
    'safety_incident',
    'route_detour',
    'app_payment_issue',
    'cancellation_fee',
    'other',
  ]),
  subject: z.string().trim().min(5, 'Subject must be at least 5 characters').max(150),
  message: z.string().trim().min(5, 'Message must be at least 5 characters').max(2000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

export const ticketReplySchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(2000),
});
