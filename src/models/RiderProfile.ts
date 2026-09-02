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
  kycStatus: KYCStatus;
  kycRejectionReason?: string;
  documents: IDocument[];
  isOnline: boolean;
  currentLocation?: ILocation;
  safetyChecklist?: ISafetyChecklist;
  canAcceptChildRides: boolean;
  totalRides: number;
  totalEarnings: number;
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
    totalEarnings: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Geospatial index for finding nearby riders
riderProfileSchema.index({ currentLocation: '2dsphere' });

export const RiderProfile = mongoose.model<IRiderProfile>('RiderProfile', riderProfileSchema);
