import mongoose, { Document, Schema } from 'mongoose';

export interface IGatewayConfig {
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  smsProvider?: string;
  smsApiKey?: string;
  smsApiSecret?: string;
}

export interface IThemeConfig {
  primaryColor?: string;
  secondaryColor?: string;
  otpMessageTemplate?: string;
  rideArrivedTemplate?: string;
  sosAlertTemplate?: string;
}

export interface ISystemConfig extends Document {
  platformCommissionRate: number;
  taxRate: number;
  maxSurgeLimit: number;
  defaultCurrency: string;
  gateways: IGatewayConfig;
  theme: IThemeConfig;
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
    theme: {
      primaryColor: { type: String, default: '#E83A59' },
      secondaryColor: { type: String, default: '#3B1E54' },
      otpMessageTemplate: { type: String, default: '{OTP} is your Woosh verification code. Do not share it with anyone.' },
      rideArrivedTemplate: { type: String, default: 'Your Woosh rider {RiderName} has arrived at the pickup location. OTP: {RideOTP}' },
      sosAlertTemplate: { type: String, default: '🚨 EMERGENCY! {UserName} has pressed SOS at {Location}. QRT Dispatch Initiated.' },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const SystemConfig = mongoose.model<ISystemConfig>('SystemConfig', systemConfigSchema);
