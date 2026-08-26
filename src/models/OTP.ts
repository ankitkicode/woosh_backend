import mongoose, { Document, Schema } from 'mongoose';

// TTL index: OTP auto-deletes after 10 minutes
export interface IOTP extends Document {
  phoneNumber: string;
  otp: string;
  attempts: number;
  expiresAt: Date;
}

const otpSchema = new Schema<IOTP>({
  phoneNumber: { type: String, required: true, index: true },
  otp: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

// MongoDB will auto-delete documents after expiresAt (TTL index)
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OTP = mongoose.model<IOTP>('OTP', otpSchema);
