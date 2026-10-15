import mongoose, { Document, Schema } from 'mongoose';
import { UserRole, Gender } from '../config/constants';

export interface IEmergencyContact {
  name: string;
  phoneNumber: string;
  relationship?: 'parent' | 'sibling' | 'friend' | 'partner' | 'other' | string;
  isPrimary?: boolean;
  sendSosAlerts?: boolean;
  autoShareRides?: boolean;
}

export interface ISession {
  deviceId: string;
  fcmToken?: string;
  os?: string;
  deviceModel?: string;
  refreshToken: string;
  lastActive: Date;
}

export interface IUser extends Document {
  phoneNumber: string;
  name?: string;
  email?: string;
  gender?: Gender;
  dateOfBirth?: string;
  city?: string;
  state?: string;
  emergencyContacts: IEmergencyContact[];
  isAadhaarVerified: boolean;
  isFaceVerified: boolean;
  role: UserRole;
  isActive: boolean;
  sessions: ISession[];
  mpin?: string;
  isMpinSet: boolean;
  mpinAttempts: number;
  mpinLockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    phoneNumber: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, sparse: true },
    gender: { type: String, enum: Object.values(Gender) },
    dateOfBirth: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    emergencyContacts: [
      {
        name: { type: String, trim: true },
        phoneNumber: { type: String, trim: true },
        relationship: { type: String, trim: true, default: 'other' },
        isPrimary: { type: Boolean, default: false },
        sendSosAlerts: { type: Boolean, default: true },
        autoShareRides: { type: Boolean, default: false },
      },
    ],
    isAadhaarVerified: { type: Boolean, default: false },
    isFaceVerified: { type: Boolean, default: false },
    role: { type: String, enum: Object.values(UserRole), default: UserRole.PASSENGER },
    isActive: { type: Boolean, default: true },
    sessions: [
      {
        deviceId: { type: String, required: true },
        fcmToken: { type: String },
        os: { type: String },
        deviceModel: { type: String },
        refreshToken: { type: String, required: true },
        lastActive: { type: Date, default: Date.now },
      },
    ],
    mpin: { type: String, select: false },
    isMpinSet: { type: Boolean, default: false },
    mpinAttempts: { type: Number, default: 0 },
    mpinLockedUntil: { type: Date },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
