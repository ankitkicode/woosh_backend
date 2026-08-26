import mongoose, { Document, Schema } from 'mongoose';

export interface IGateway extends Document {
  provider: string; // e.g., 'razorpay', 'twilio', 'firebase'
  type: string; // e.g., 'payment', 'sms', 'push'
  keys: Map<string, string>; // e.g., { "key_id": "...", "key_secret": "..." }
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const gatewaySchema = new Schema<IGateway>(
  {
    provider: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    keys: { type: Map, of: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Ensure provider and type combination is unique
gatewaySchema.index({ provider: 1, type: 1 }, { unique: true });

export const Gateway = mongoose.model<IGateway>('Gateway', gatewaySchema);
