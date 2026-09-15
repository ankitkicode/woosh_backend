import mongoose, { Document, Schema } from 'mongoose';

export interface IGatewayConfig {
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  smsProvider?: string;
  smsApiKey?: string;
  smsApiSecret?: string;
}

export interface ISystemConfig extends Document {
  platformCommissionRate: number;
  taxRate: number;
  maxSurgeLimit: number;
  defaultCurrency: string;
  gateways: IGatewayConfig;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const systemConfigSchema = new Schema<ISystemConfig>(
  {
    platformCommissionRate: { type: Number, default: 20 }, // 20%
    taxRate: { type: Number, default: 5 }, // 5% GST
    maxSurgeLimit: { type: Number, default: 3.0 }, // 3x surge
    defaultCurrency: { type: String, default: 'INR' },
    gateways: {
      razorpayKeyId: { type: String },
      razorpayKeySecret: { type: String },
      smsProvider: { type: String, default: 'Twilio' },
      smsApiKey: { type: String },
      smsApiSecret: { type: String },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const SystemConfig = mongoose.model<ISystemConfig>('SystemConfig', systemConfigSchema);
