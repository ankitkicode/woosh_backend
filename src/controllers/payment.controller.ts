import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { RiderProfile } from '../models/RiderProfile';
import { User } from '../models/User';
import { WalletTransaction } from '../models/WalletTransaction';
import { WalletTransactionType } from '../config/constants';
import { paymentService } from '../services/payment.service';

/**
 * @route   GET /api/v1/payment/wallet
 * @desc    Get user's wallet balance
 * @access  Protected
 */
export const getWallet = asyncHandler(async (req: Request, res: Response) => {
  const profile = await RiderProfile.findOne({ user: req.user?._id }).select('walletBalance');
  res.status(200).json(new ApiResponse(200, 'Wallet fetched', { walletBalance: profile?.walletBalance || 0 }));
});

/**
 * @route   POST /api/v1/payment/wallet/topup/order
 * @desc    Create Razorpay order for wallet topup
 * @access  Protected
 */
export const createTopupOrder = asyncHandler(async (req: Request, res: Response) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) throw new ApiError(400, 'Invalid amount');

  const receipt = `receipt_topup_${req.user?._id}_${Date.now()}`;
  const order = await paymentService.createOrder(amount, receipt);

  res.status(200).json(new ApiResponse(200, 'Payment order created', { order }));
});

/**
 * @route   POST /api/v1/payment/wallet/topup/verify
 * @desc    Verify Razorpay payment and credit wallet
 * @access  Protected
 */
export const verifyTopupPayment = asyncHandler(async (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
  
  const isValid = paymentService.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) throw new ApiError(400, 'Invalid payment signature');

  // If valid, credit wallet
  const profile = await RiderProfile.findOneAndUpdate(
    { user: req.user?._id },
    { $inc: { walletBalance: amount } },
    { new: true }
  );

  const newBalance = profile?.walletBalance || amount;

  await WalletTransaction.create({
    user: req.user?._id,
    type: WalletTransactionType.TOPUP,
    amount,
    description: `Wallet top-up (Txn: ${razorpay_payment_id})`,
    balanceAfter: newBalance,
  });

  res.status(200).json(new ApiResponse(200, `₹${amount} added to wallet`, { walletBalance: newBalance }));
});

/**
 * @route   GET /api/v1/payment/transactions
 * @desc    Get paginated wallet transaction history
 * @access  Protected
 */
export const getTransactions = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    WalletTransaction.find({ user: req.user?._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    WalletTransaction.countDocuments({ user: req.user?._id }),
  ]);

  res.status(200).json(new ApiResponse(200, 'Transactions fetched', {
    transactions, page, limit, total, totalPages: Math.ceil(total / limit),
  }));
});
