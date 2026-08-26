import mongoose, { Document, Schema } from 'mongoose';

export interface IChildProfile extends Document {
  passenger: mongoose.Types.ObjectId;
  name: string;
  age: number;
  profileImage?: string;
  schoolName?: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  createdAt: Date;
  updatedAt: Date;
}

const childProfileSchema = new Schema<IChildProfile>(
  {
    passenger: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 3, max: 14 },
    profileImage: { type: String },
    schoolName: { type: String, trim: true },
    emergencyContactName: { type: String, required: true, trim: true },
    emergencyContactPhone: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export const ChildProfile = mongoose.model<IChildProfile>('ChildProfile', childProfileSchema);
