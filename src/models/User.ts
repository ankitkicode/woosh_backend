import mongoose, { Document, Schema } from 'mongoose';
import { UserRole, Gender } from '../config/constants';

interface IEmergencyContact {
  name: string;
  phoneNumber: string;
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
  emergencyContacts: IEmergencyContact[];
  isAadhaarVerified: boolean;
  isFaceVerified: boolean;
  role: UserRole;
  isActive: boolean;
  sessions: ISession[];
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
    emergencyContacts: [
      {
        name: { type: String, trim: true },
        phoneNumber: { type: String, trim: true },
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
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
