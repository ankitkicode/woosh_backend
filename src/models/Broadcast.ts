import mongoose, { Document, Schema } from 'mongoose';

export interface IBroadcast extends Document {
  title: string;
  body: string;
  target: 'ALL' | 'PASSENGERS' | 'RIDERS';
  city?: string;
  platform?: string;
  type?: string;
  imageUrl?: string;
  data?: Record<string, any>;
  sentBy?: mongoose.Types.ObjectId;
  sentByName?: string;
  sentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const broadcastSchema = new Schema<IBroadcast>(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    target: { type: String, enum: ['ALL', 'PASSENGERS', 'RIDERS'], default: 'ALL' },
    city: { type: String, trim: true },
    platform: { type: String, trim: true, default: 'ALL' },
    type: { type: String, default: 'ANNOUNCEMENT' },
    imageUrl: { type: String, trim: true },
    data: { type: Schema.Types.Mixed, default: {} },
    sentBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    sentByName: { type: String, trim: true },
    sentCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

broadcastSchema.index({ createdAt: -1 });

export const Broadcast = mongoose.model<IBroadcast>('Broadcast', broadcastSchema);
