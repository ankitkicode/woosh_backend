import mongoose, { Document, Schema } from 'mongoose';

export enum PayoutStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
}

export interface IPayoutRequest extends Document {
  rider: mongoose.Types.ObjectId;
  amount: number;
  bankAccount: mongoose.Types.ObjectId;
  status: PayoutStatus;
  requestedAt: Date;
  processedAt?: Date;
  processedBy?: mongoose.Types.ObjectId; // Admin user
  remarks?: string;
  transactionRef?: string;
}

const payoutRequestSchema = new Schema<IPayoutRequest>(
  {
    rider: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    bankAccount: { type: Schema.Types.ObjectId, ref: 'BankAccount', required: true },
    status: { type: String, enum: Object.values(PayoutStatus), default: PayoutStatus.PENDING },
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    processedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    remarks: { type: String },
    transactionRef: { type: String },
  },
  { timestamps: true }
);

export const PayoutRequest = mongoose.model<IPayoutRequest>('PayoutRequest', payoutRequestSchema);
