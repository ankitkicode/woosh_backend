import mongoose, { Document, Schema } from 'mongoose';

export interface IInsuranceClaim extends Document {
  rideId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: 'passenger' | 'rider';
  incidentDate: Date;
  description: string;
  claimType: 'accident' | 'vehicle_damage' | 'medical' | 'other';
  status: 'pending' | 'processing' | 'approved' | 'rejected';
  amountRequested?: number;
  amountApproved?: number;
  thirdPartyClaimId?: string;
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const insuranceClaimSchema = new Schema<IInsuranceClaim>(
  {
    rideId: { type: Schema.Types.ObjectId, ref: 'Ride', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['passenger', 'rider'], required: true },
    incidentDate: { type: Date, required: true },
    description: { type: String, required: true },
    claimType: { type: String, enum: ['accident', 'vehicle_damage', 'medical', 'other'], required: true },
    status: { type: String, enum: ['pending', 'processing', 'approved', 'rejected'], default: 'pending' },
    amountRequested: { type: Number },
    amountApproved: { type: Number },
    thirdPartyClaimId: { type: String },
    adminNotes: { type: String },
  },
  { timestamps: true }
);

export const InsuranceClaim = mongoose.model<IInsuranceClaim>('InsuranceClaim', insuranceClaimSchema);
