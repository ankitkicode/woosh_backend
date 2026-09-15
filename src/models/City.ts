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
  // Geo & Service Area
  latitude: number;
  longitude: number;
  serviceRadius: number; // in km
  pincodes: string[];
  // GeoJSON for geofencing
  location?: {
    type: string;
    coordinates: number[];
  };
  polygon?: any;
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
    // Geo & Service Area
    latitude: { type: Number, default: 0 },
    longitude: { type: Number, default: 0 },
    serviceRadius: { type: Number, default: 25 }, // default 25km radius
    pincodes: [{ type: String, trim: true }],
    // GeoJSON Point for geo-queries
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
    polygon: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Ensure city name is unique per state/country
citySchema.index({ name: 1, state: 1, country: 1 }, { unique: true });

// Geo index for location-based queries
citySchema.index({ location: '2dsphere' });

// Index on pincodes for fast pincode lookup
citySchema.index({ pincodes: 1 });

// Auto-sync location from lat/lng before save
citySchema.pre('save', function () {
  if (this.latitude && this.longitude) {
    this.location = {
      type: 'Point',
      coordinates: [this.longitude, this.latitude],
    };
  }
});

export const City = mongoose.model<ICity>('City', citySchema);
