import mongoose, { Document, Schema } from 'mongoose';

export interface ISavedPlace extends Document {
  user: mongoose.Types.ObjectId;
  type: 'home' | 'work' | 'other';
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  landmark?: string;
  createdAt: Date;
  updatedAt: Date;
}

const savedPlaceSchema = new Schema<ISavedPlace>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['home', 'work', 'other'], default: 'other' },
    title: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    landmark: { type: String, trim: true },
  },
  { timestamps: true }
);

// Compound index for user query efficiency
savedPlaceSchema.index({ user: 1, type: 1 });

export const SavedPlace = mongoose.model<ISavedPlace>('SavedPlace', savedPlaceSchema);
