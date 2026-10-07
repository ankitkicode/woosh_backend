import mongoose, { Document, Schema } from 'mongoose';

export interface ICity extends Document {
  name: string;
  state: string;
  country: string;
  isActive: boolean;
  // Pricing
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minFare: number;
  isSurgeActive: boolean;
  surgeMultiplier: number;
  // Service Area
  pincodes: string[];
  areas: {
    name: string;
    latitude: number;
    longitude: number;
    serviceRadius: number;
    isActive: boolean;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const citySchema = new Schema<ICity>(
  {
    name: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'India' },
    isActive: { type: Boolean, default: true },
    // Pricing
    baseFare: { type: Number, required: true, min: 0 },
    perKmRate: { type: Number, required: true, min: 0 },
    perMinuteRate: { type: Number, required: true, min: 0 },
    minFare: { type: Number, required: true, min: 0, default: 50 },
    isSurgeActive: { type: Boolean, default: false },
    surgeMultiplier: { type: Number, default: 1, min: 1 },
    // Service Area
    pincodes: [{ type: String, trim: true }],
    areas: [{
      name: { type: String, required: true, trim: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      serviceRadius: { type: Number, required: true, min: 0 },
      isActive: { type: Boolean, default: true }
    }],
  },
  { timestamps: true }
);

// Ensure city name is unique per state/country
citySchema.index({ name: 1, state: 1, country: 1 }, { unique: true });

// Index on pincodes for fast pincode lookup
citySchema.index({ pincodes: 1 });

export const City = mongoose.model<ICity>('City', citySchema);
