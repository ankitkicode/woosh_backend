import mongoose, { Document, Schema } from 'mongoose';
import { KYCStatus, DocumentType } from '../config/constants';

interface IDocument {
  type: DocumentType;
  url: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
}

interface ILocation {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

interface IPreferences {
  maxPickupDistance: number;
  acceptCashRides: boolean;
  rideRequestSound: boolean;
  language: string;
  payoutSchedule: 'WEEKLY' | 'DAILY';
}

interface ISafetyPreferences {
  shareEveryTrip: boolean;
  stopRequestsAfter10PM: boolean;
  rideCheck: boolean;
  recordAudioOnSOS: boolean;
}

interface ISafetyChecklist {
  helmetAvailable: boolean;
  firstAidKitAvailable: boolean;
  sanitaryPadsAvailable: boolean;
  phoneBatteryCheck: boolean;
  faceVerified: boolean;
  checkedAt?: Date;
}

export interface IRiderProfile extends Document {
  user: mongoose.Types.ObjectId;
  profileImage?: string;
  vehicleNumber: string;
  vehicleModel?: string;
  vehicleColor?: string;
  areas?: string[];
  kycStatus: KYCStatus;
  kycRejectionReason?: string;
  documents: IDocument[];
  isOnline: boolean;
  currentLocation?: ILocation;
  safetyChecklist?: ISafetyChecklist;
  canAcceptChildRides: boolean;
  totalRides: number;
  totalRideRequests: number;
  acceptedRides: number;
  totalEarnings: number;
  onlineHours: number;
  preferences: IPreferences;
  safetyPreferences: ISafetyPreferences;
  walletBalance: number;
  rating: number;
  totalRatings: number;
  createdAt: Date;
  updatedAt: Date;
}

const riderProfileSchema = new Schema<IRiderProfile>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    profileImage: { type: String },
    vehicleNumber: { type: String, required: true, trim: true, uppercase: true },
    vehicleModel: { type: String, trim: true },
    vehicleColor: { type: String, trim: true },
    areas: [{ type: String, trim: true }],
    kycStatus: { type: String, enum: Object.values(KYCStatus), default: KYCStatus.PENDING },
    kycRejectionReason: { type: String },
    documents: [
      {
        type: { type: String, enum: Object.values(DocumentType) },
        url: { type: String },
        status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
        rejectionReason: { type: String },
      },
    ],
    isOnline: { type: Boolean, default: false },
    safetyChecklist: {
      helmetAvailable: { type: Boolean, default: false },
      firstAidKitAvailable: { type: Boolean, default: false },
      sanitaryPadsAvailable: { type: Boolean, default: false },
      phoneBatteryCheck: { type: Boolean, default: false },
      faceVerified: { type: Boolean, default: false },
      checkedAt: { type: Date },
    },
    canAcceptChildRides: { type: Boolean, default: false },
    currentLocation: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined },
    },
    totalRides: { type: Number, default: 0 },
    totalRideRequests: { type: Number, default: 0 },
    acceptedRides: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    onlineHours: { type: Number, default: 0 },
    preferences: {
      maxPickupDistance: { type: Number, default: 3 },
      acceptCashRides: { type: Boolean, default: true },
      rideRequestSound: { type: Boolean, default: true },
      language: { type: String, default: 'English' },
      payoutSchedule: { type: String, enum: ['WEEKLY', 'DAILY'], default: 'WEEKLY' }
    },
    safetyPreferences: {
      shareEveryTrip: { type: Boolean, default: false },
      stopRequestsAfter10PM: { type: Boolean, default: false },
      rideCheck: { type: Boolean, default: true },
      recordAudioOnSOS: { type: Boolean, default: false }
    },
    walletBalance: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Geospatial index for finding nearby riders
riderProfileSchema.index({ currentLocation: '2dsphere' });

export const RiderProfile = mongoose.model<IRiderProfile>('RiderProfile', riderProfileSchema);
