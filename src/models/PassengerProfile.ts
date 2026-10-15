import mongoose, { Document, Schema } from 'mongoose';

export interface IPassengerPreferences {
  language: string;
  rideUpdates: boolean;
  offersAndPromotions: boolean;
  whatsappUpdates: boolean;
  hideFullNameFromRiders: boolean;
  defaultPaymentMethod: 'cash' | 'upi' | 'wallet';
}

export interface IPassengerSafetySettings {
  autoShareEveryRide: boolean;
  rideCheck: boolean;
  nightRideProtection: boolean;
  recordAudioOnSOS: boolean;
  sosStopPin?: string;
}

export interface IPassengerProfile extends Document {
  user: mongoose.Types.ObjectId;
  profileImage?: string;
  walletBalance: number;
  rating: number;
  totalRatings: number;
  totalRides: number;

  // Women Safety & Face Verification
  isWomenVerified: boolean;
  faceVerificationStatus: 'not_initiated' | 'pending' | 'verified' | 'failed';
  faceVerificationImage?: string;
  faceVerifiedAt?: Date;
  faceVerificationFailureReason?: string;

  referralCode: string;
  referredBy?: mongoose.Types.ObjectId;
  referralEarnings: number;

  preferences: IPassengerPreferences;
  safetySettings: IPassengerSafetySettings;

  createdAt: Date;
  updatedAt: Date;
}

const passengerProfileSchema = new Schema<IPassengerProfile>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    profileImage: { type: String },
    walletBalance: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 5.0, min: 1.0, max: 5.0 },
    totalRatings: { type: Number, default: 0 },
    totalRides: { type: Number, default: 0 },

    // Women safety face verification
    isWomenVerified: { type: Boolean, default: false },
    faceVerificationStatus: {
      type: String,
      enum: ['not_initiated', 'pending', 'verified', 'failed'],
      default: 'not_initiated',
    },
    faceVerificationImage: { type: String },
    faceVerifiedAt: { type: Date },
    faceVerificationFailureReason: { type: String },

    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    referralEarnings: { type: Number, default: 0 },

    preferences: {
      language: { type: String, default: 'English' },
      rideUpdates: { type: Boolean, default: true },
      offersAndPromotions: { type: Boolean, default: false },
      whatsappUpdates: { type: Boolean, default: true },
      hideFullNameFromRiders: { type: Boolean, default: true },
      defaultPaymentMethod: { type: String, enum: ['cash', 'upi', 'wallet'], default: 'cash' },
    },

    safetySettings: {
      autoShareEveryRide: { type: Boolean, default: false },
      rideCheck: { type: Boolean, default: true },
      nightRideProtection: { type: Boolean, default: true },
      recordAudioOnSOS: { type: Boolean, default: false },
      sosStopPin: { type: String },
    },
  },
  { timestamps: true }
);

export const PassengerProfile = mongoose.model<IPassengerProfile>('PassengerProfile', passengerProfileSchema);
