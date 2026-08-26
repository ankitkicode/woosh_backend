import mongoose, { Document, Schema } from 'mongoose';
import {
  RideStatus, PaymentMethod, PaymentStatus, CancellationBy,
} from '../config/constants';

interface ICoordinate {
  latitude: number;
  longitude: number;
  address?: string;
}

interface ICancellation {
  cancelledBy: CancellationBy;
  reason?: string;
  cancelledAt: Date;
}

interface IRating {
  passengerRating?: number;
  passengerComment?: string;
  riderRating?: number;
  riderComment?: string;
}

interface IAiSafetyAlert {
  type: string; // 'route_deviation', 'overspeeding', 'unexpected_stop', 'gps_loss'
  timestamp: Date;
  location?: ICoordinate;
  resolved: boolean;
}

interface IInsuranceDetails {
  personalAccident: boolean;
  riderInsurance: boolean;
  passengerInsurance: boolean;
  policyId?: string;
}

export interface IRide extends Document {
  passenger: mongoose.Types.ObjectId;
  rider?: mongoose.Types.ObjectId;
  childProfile?: mongoose.Types.ObjectId;
  pickup: ICoordinate;
  drop: ICoordinate;
  status: RideStatus;
  otp: string;                   // 4-digit OTP to start ride
  distanceKm?: number;
  durationMinutes?: number;
  estimatedFare?: number;
  finalFare?: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  isSurge: boolean;
  surgeMultiplier: number;
  cancellation?: ICancellation;
  rating?: IRating;
  audioRecordingConsent: boolean;
  videoRecordingConsent: boolean;
  aiSafetyAlerts: IAiSafetyAlert[];
  insuranceDetails?: IInsuranceDetails;
  waitingCharges: number;
  sosTriggeredAt?: Date;
  riderArrivedAt?: Date;
  rideStartedAt?: Date;
  rideEndedAt?: Date;
  
  // Ride Assignment Algorithm
  notifiedRiders: mongoose.Types.ObjectId[];
  assignedRider?: mongoose.Types.ObjectId;
  assignmentExpiresAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

const coordinateSchema = new Schema<ICoordinate>({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  address: { type: String },
}, { _id: false });

const rideSchema = new Schema<IRide>(
  {
    passenger: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rider: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    childProfile: { type: Schema.Types.ObjectId, ref: 'ChildProfile' },
    pickup: { type: coordinateSchema, required: true },
    drop: { type: coordinateSchema, required: true },
    status: { type: String, enum: Object.values(RideStatus), default: RideStatus.REQUESTED, index: true },
    otp: { type: String, required: true },
    distanceKm: { type: Number },
    durationMinutes: { type: Number },
    estimatedFare: { type: Number },
    finalFare: { type: Number },
    paymentMethod: { type: String, enum: Object.values(PaymentMethod), default: PaymentMethod.CASH },
    paymentStatus: { type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING },
    isSurge: { type: Boolean, default: false },
    surgeMultiplier: { type: Number, default: 1.0 },
    cancellation: {
      cancelledBy: { type: String, enum: Object.values(CancellationBy) },
      reason: { type: String },
      cancelledAt: { type: Date },
    },
    rating: {
      passengerRating: { type: Number, min: 1, max: 5 },
      passengerComment: { type: String },
      riderRating: { type: Number, min: 1, max: 5 },
      riderComment: { type: String },
    },
    audioRecordingConsent: { type: Boolean, default: false },
    videoRecordingConsent: { type: Boolean, default: false },
    aiSafetyAlerts: [
      {
        type: { type: String },
        timestamp: { type: Date, default: Date.now },
        location: coordinateSchema,
        resolved: { type: Boolean, default: false },
      },
    ],
    insuranceDetails: {
      personalAccident: { type: Boolean, default: true },
      riderInsurance: { type: Boolean, default: true },
      passengerInsurance: { type: Boolean, default: true },
      policyId: { type: String },
    },
    waitingCharges: { type: Number, default: 0 },
    sosTriggeredAt: { type: Date },
    riderArrivedAt: { type: Date },
    rideStartedAt: { type: Date },
    rideEndedAt: { type: Date },
    
    // Ride Assignment Tracking
    notifiedRiders: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    assignedRider: { type: Schema.Types.ObjectId, ref: 'User' },
    assignmentExpiresAt: { type: Date },
  },
  { timestamps: true }
);

export const Ride = mongoose.model<IRide>('Ride', rideSchema);
