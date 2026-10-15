import mongoose, { Document, Schema } from 'mongoose';

export interface ISavedPaymentMethod extends Document {
  user: mongoose.Types.ObjectId;
  type: 'upi' | 'card';
  upiId?: string;
  cardLast4?: string;
  cardBrand?: string;
  isDefault: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const savedPaymentMethodSchema = new Schema<ISavedPaymentMethod>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['upi', 'card'], required: true },
    upiId: { type: String, trim: true, lowercase: true },
    cardLast4: { type: String, trim: true },
    cardBrand: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

savedPaymentMethodSchema.index({ user: 1, isDefault: -1 });

export const SavedPaymentMethod = mongoose.model<ISavedPaymentMethod>('SavedPaymentMethod', savedPaymentMethodSchema);
