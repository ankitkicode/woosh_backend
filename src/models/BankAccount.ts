import mongoose, { Document, Schema } from 'mongoose';

export interface IBankAccount extends Document {
  rider: mongoose.Types.ObjectId;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  isPrimary: boolean;
}

const bankAccountSchema = new Schema<IBankAccount>(
  {
    rider: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountHolderName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    ifscCode: { type: String, required: true },
    bankName: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Pre-save middleware to ensure only one primary account per rider
bankAccountSchema.pre('save', async function () {
  if (this.isModified('isPrimary') && this.isPrimary) {
    await mongoose.model('BankAccount').updateMany(
      { rider: this.rider, _id: { $ne: this._id } },
      { $set: { isPrimary: false } }
    );
  }
});

export const BankAccount = mongoose.model<IBankAccount>('BankAccount', bankAccountSchema);
