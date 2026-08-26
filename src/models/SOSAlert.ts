import mongoose, { Document, Schema } from 'mongoose';

export interface ISOSAlert extends Document {
  rideId?: mongoose.Types.ObjectId;
  triggeredBy: mongoose.Types.ObjectId;
  role: 'passenger' | 'rider';
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  status: 'active' | 'resolved' | 'false_alarm';
  resolvedBy?: mongoose.Types.ObjectId;
  resolutionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const sosAlertSchema = new Schema<ISOSAlert>(
  {
    rideId: { type: Schema.Types.ObjectId, ref: 'Ride' },
    triggeredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['passenger', 'rider'], required: true },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      address: { type: String },
    },
    status: { type: String, enum: ['active', 'resolved', 'false_alarm'], default: 'active' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolutionNotes: { type: String },
  },
  { timestamps: true }
);

export const SOSAlert = mongoose.model<ISOSAlert>('SOSAlert', sosAlertSchema);
