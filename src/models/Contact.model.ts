import mongoose, { Schema, Document } from 'mongoose';

export interface IContact extends Document {
  name: string;
  phone: string;
  queryType: string;
  message: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    queryType: { type: String, required: true },
    message: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: ['pending', 'resolved', 'closed'], default: 'pending' },
  },
  { timestamps: true }
);

export const Contact = mongoose.model<IContact>('Contact', contactSchema);
