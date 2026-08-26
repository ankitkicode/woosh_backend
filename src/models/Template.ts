import mongoose, { Document, Schema } from 'mongoose';

export interface ITemplate extends Document {
  name: string; // e.g., 'Primary Color', 'SOS SMS', 'Ride Accepted Push'
  type: string; // e.g., 'theme_color', 'sms', 'push'
  content: string; // e.g., '#E83A59' or 'Your ride has been accepted...'
  variables?: string[]; // e.g., ['{{riderName}}', '{{otp}}']
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const templateSchema = new Schema<ITemplate>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    variables: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Ensure name is unique
templateSchema.index({ name: 1 }, { unique: true });

export const Template = mongoose.model<ITemplate>('Template', templateSchema);
