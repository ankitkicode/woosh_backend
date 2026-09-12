import { z } from 'zod';

export const updateRiderProfileSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  email: z.string().email().optional().or(z.literal('')),
  gender: z.literal('female').optional(),
  dateOfBirth: z.string().trim().optional(),
  city: z.string().trim().optional(),
  vehicleNumber: z.string().trim().toUpperCase().min(4).max(15).optional(),
  vehicleModel: z.string().trim().max(50).optional(),
  vehicleColor: z.string().trim().max(30).optional(),
});

export const kycSubmitSchema = z.object({
  vehicleNumber: z.string().trim().toUpperCase().min(4, 'Vehicle number is required'),
});

export const locationUpdateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const updateChildSchema = z.object({
  name: z.string().trim().min(2).max(50),
  age: z.number().int().min(3).max(14),
  schoolName: z.string().trim().max(100).optional(),
  emergencyContactName: z.string().trim().min(2).max(50),
  emergencyContactPhone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Invalid emergency contact phone'),
});

export const walletTopupSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(10000, 'Max topup amount is ₹10,000'),
});

export const disputeSchema = z.object({
  category: z.enum(['fare', 'driver_behaviour', 'passenger_behaviour', 'route_issues', 'lost_belongings', 'payment_issues', 'safety_incidents']),
  subject: z.string().trim().min(5).max(100),
  description: z.string().trim().min(10).max(1000),
  rideId: z.string().optional(),
});

export const updatePassengerProfileSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  email: z.string().email().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  emergencyContacts: z.array(z.object({
    name: z.string().trim().min(2).max(50),
    phoneNumber: z.string().trim().regex(/^[6-9]\d{9}$/, 'Invalid phone number'),
  })).max(5).optional(),
});
