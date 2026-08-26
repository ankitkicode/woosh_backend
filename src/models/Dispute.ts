import mongoose, { Document, Schema } from 'mongoose';
import { ComplaintStatus, DisputeCategory } from '../config/constants';

export interface IDispute extends Document {
  caseId: string;
  raisedBy: mongoose.Types.ObjectId;
  againstUser?: mongoose.Types.ObjectId;
  ride?: mongoose.Types.ObjectId;
  category: DisputeCategory;
  subject: string;
  description: string;
  status: ComplaintStatus;
  adminNotes?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const disputeSchema = new Schema<IDispute>(
  {
    caseId: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true,
      default: () => `WSH-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}` 
    },
    raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    againstUser: { type: Schema.Types.ObjectId, ref: 'User' },
    ride: { type: Schema.Types.ObjectId, ref: 'Ride' },
    category: { type: String, enum: Object.values(DisputeCategory), required: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: Object.values(ComplaintStatus), default: ComplaintStatus.OPEN },
    adminNotes: { type: String },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

export const Dispute = mongoose.model<IDispute>('Dispute', disputeSchema);
