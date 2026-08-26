import mongoose, { Document, Schema } from 'mongoose';

export interface IPricingRule extends Document {
  city: string;
  baseFare: number;
  costPerKm: number;
  costPerMinute: number;
  isSurgeActive: boolean;
  surgeMultiplier: number;
  minFare: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const pricingRuleSchema = new Schema<IPricingRule>(
  {
    city: { type: String, required: true, unique: true, trim: true, lowercase: true },
    baseFare: { type: Number, required: true, default: 20 },
    costPerKm: { type: Number, required: true, default: 10 },
    costPerMinute: { type: Number, required: true, default: 1.5 },
    isSurgeActive: { type: Boolean, default: false },
    surgeMultiplier: { type: Number, default: 1.0 },
    minFare: { type: Number, default: 30 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const PricingRule = mongoose.model<IPricingRule>('PricingRule', pricingRuleSchema);
