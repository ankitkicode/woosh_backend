import mongoose, { Document, Schema } from 'mongoose';
import { WalletTransactionType } from '../config/constants';

export interface IWalletTransaction extends Document {
  user: mongoose.Types.ObjectId;
  type: WalletTransactionType;
  amount: number;
  description: string;
  referenceId?: string; // ride ID or payment gateway ref
  balanceAfter: number;
  category?: string; // 'ride_earnings', 'commission_deduction', 'payout', 'cash_dues_repayment', 'topup', 'refund'
  createdAt: Date;
}

const walletTransactionSchema = new Schema<IWalletTransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: Object.values(WalletTransactionType), required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true, trim: true },
    referenceId: { type: String },
    balanceAfter: { type: Number, required: true },
    category: { type: String, trim: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const WalletTransaction = mongoose.model<IWalletTransaction>('WalletTransaction', walletTransactionSchema);
