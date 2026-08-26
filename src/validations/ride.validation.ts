import { z } from 'zod';
import { PaymentMethod } from '../config/constants';

const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().optional(),
});

export const rideEstimateSchema = z.object({
  pickup: coordinateSchema,
  drop: coordinateSchema,
});

export const requestRideSchema = z.object({
  pickup: coordinateSchema,
  drop: coordinateSchema,
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  childProfileId: z.string().optional(),
});

export const cancelRideSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required').max(200),
});

export const rateRideSchema = z.object({
  passengerRating: z.number().min(1).max(5).optional(),
  passengerComment: z.string().max(300).optional(),
  riderRating: z.number().min(1).max(5).optional(),
  riderComment: z.string().max(300).optional(),
});
