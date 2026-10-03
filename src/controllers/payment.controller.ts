import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { RiderProfile } from '../models/RiderProfile';
import { User } from '../models/User';
import { WalletTransaction } from '../models/WalletTransaction';
import { WalletTransactionType, PaymentMethod, PaymentStatus } from '../config/constants';
import { Ride } from '../models/Ride';
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

/**
 * @route   POST /api/v1/payment/ride/:id/order
 * @desc    Create Razorpay order for ride online payment
 * @access  Protected (Passenger)
 */
export const createRideOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const ride = await Ride.findById(id);

  if (!ride) throw new ApiError(404, 'Ride not found');
  if (ride.passenger.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, 'Not authorized for this ride');
  }

  // Use finalFare if ride ended, else use estimatedFare
  let amountToPay = ride.finalFare;
  if (!amountToPay) {
    amountToPay = ride.estimatedFare || 0;
    ride.finalFare = amountToPay;
    
    // Calculate Commission here if paying early
    import('../models/SystemConfig').then(async ({ SystemConfig }) => {
      const config = await SystemConfig.findOne();
      const platformCommissionRate = config?.platformCommissionRate || 20;
      ride.platformCommission = Number(((amountToPay as number) * (platformCommissionRate / 100)).toFixed(2));
      ride.riderEarnings = Number(((amountToPay as number) - ride.platformCommission).toFixed(2));
      await ride.save();
    }).catch(console.error);
  }

  if (!amountToPay || amountToPay <= 0) {
    throw new ApiError(400, 'Invalid fare amount');
  }

  const receipt = `receipt_ride_${id}`;
  const order = await paymentService.createOrder(amountToPay, receipt);

  ride.razorpayOrderId = order.id;
  await ride.save();

  res.status(200).json(new ApiResponse(200, 'Ride payment order created', { order }));
});

/**
 * @route   POST /api/v1/payment/ride/:id/verify
 * @desc    Verify Razorpay ride payment and credit rider
 * @access  Protected (Passenger)
 */
export const verifyRidePayment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const ride = await Ride.findById(id);
  if (!ride) throw new ApiError(404, 'Ride not found');
  if (ride.razorpayOrderId !== razorpay_order_id) {
    throw new ApiError(400, 'Order ID mismatch');
  }

  const isValid = paymentService.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) throw new ApiError(400, 'Invalid payment signature');

  // Update ride payment status
  ride.paymentMethod = PaymentMethod.UPI;
  ride.paymentStatus = PaymentStatus.PAID;
  ride.razorpayPaymentId = razorpay_payment_id;
  await ride.save();

  // If rider exists and ride has platformCommission and finalFare, credit rider's wallet
  if (ride.rider && ride.finalFare && ride.platformCommission !== undefined) {
    const riderShare = ride.finalFare - ride.platformCommission;

    const profile = await RiderProfile.findOneAndUpdate(
      { user: ride.rider },
      { $inc: { walletBalance: riderShare } },
      { new: true }
    );

    const newBalance = profile?.walletBalance || riderShare;

    await WalletTransaction.create({
      user: ride.rider,
      type: WalletTransactionType.TOPUP,
      amount: riderShare,
      description: `Earnings for Ride: ${ride._id}`,
      balanceAfter: newBalance,
      referenceId: ride._id.toString()
    });
  }

  // Emit socket event to notify Rider that payment is received
  import('../sockets/tracking.socket').then(({ ioInstance }) => {
    if (ioInstance && ride.rider) {
      ioInstance.to(`rider:${ride.rider.toString()}`).emit('payment_received', { rideId: ride._id, amount: ride.finalFare });
    }
  }).catch(err => console.error('[Socket] Error in verifyRidePayment:', err));

  res.status(200).json(new ApiResponse(200, 'Ride payment verified successfully', { ride }));
});
