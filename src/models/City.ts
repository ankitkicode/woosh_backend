import mongoose, { Document, Schema } from 'mongoose';

export interface ICity extends Document {
  name: string;
  state: string;
  country: string;
  isActive: boolean;
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  surgeMultiplier: number;
  polygon?: any; // GeoJSON for geofencing (optional for MVP)
  createdAt: Date;
  updatedAt: Date;
}

const citySchema = new Schema<ICity>(
  {
    name: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'India' },
    isActive: { type: Boolean, default: true },
    baseFare: { type: Number, required: true, min: 0 },
    perKmRate: { type: Number, required: true, min: 0 },
    perMinuteRate: { type: Number, required: true, min: 0 },
    surgeMultiplier: { type: Number, default: 1, min: 1 },
    polygon: { type: Schema.Types.Mixed }, 
  },
  { timestamps: true }
);

// Ensure city name is unique per state/country
citySchema.index({ name: 1, state: 1, country: 1 }, { unique: true });

export const City = mongoose.model<ICity>('City', citySchema);
