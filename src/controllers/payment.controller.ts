import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { RiderProfile } from '../models/RiderProfile';
import { PassengerProfile } from '../models/PassengerProfile';
import { User } from '../models/User';
import { WalletTransaction } from '../models/WalletTransaction';
import { WalletTransactionType, PaymentMethod, PaymentStatus, RideStatus, UserRole } from '../config/constants';
import { Ride } from '../models/Ride';
import { SystemConfig } from '../models/SystemConfig';
import mongoose from 'mongoose';
import { PayoutRequest, PayoutStatus } from '../models/PayoutRequest';
import { paymentService } from '../services/payment.service';
import { StatementPdfService } from '../services/statementPdf.service';
import { fcmService } from '../services/fcm.service';

/**
 * Calculates monthly statement financial breakdown using real MongoDB records
 */
export const calculateMonthlyStatementData = async (userId: string, monthParam?: string) => {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1; // 1-12

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    if (y >= 2020 && m >= 1 && m <= 12) {
      year = y;
      month = m;
    }
  }

  const monthStr = month < 10 ? `0${month}` : `${month}`;
  const monthKey = `${year}-${monthStr}`;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabel = `${monthNames[month - 1]} ${year}`;

  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const lastDay = new Date(year, month, 0).getDate();
  const endOfMonth = new Date(year, month - 1, lastDay, 23, 59, 59, 999);

  // Fetch Driver Profile, User, and SystemConfig
  const [user, profile, systemConfig] = await Promise.all([
    User.findById(userId),
    RiderProfile.findOne({ user: userId }),
    SystemConfig.findOne(),
  ]);

  const platformCommissionRate = systemConfig?.platformCommissionRate ?? 20;

  // Real database aggregation on completed rides for this rider in the selected month
  const rides = await Ride.find({
    rider: userId,
    status: { $in: [RideStatus.COMPLETED, RideStatus.PAYMENT_COMPLETED] },
    $or: [
      { rideEndedAt: { $gte: startOfMonth, $lte: endOfMonth } },
      { rideEndedAt: { $exists: false }, createdAt: { $gte: startOfMonth, $lte: endOfMonth } }
    ]
  });

  let totalRideFares = 0;
  let paidOnline = 0;
  let cashCollected = 0;
  let tipsAndIncentives = 0;
  let wooshCommission = 0;
  const activeDaysSet = new Set<string>();
  let totalDurationMinutes = 0;

  rides.forEach(ride => {
    const fare = ride.finalFare ?? ride.estimatedFare ?? 0;
    totalRideFares += fare;

    if (ride.paymentMethod === PaymentMethod.CASH) {
      cashCollected += fare;
    } else {
      paidOnline += fare;
    }

    const commission = ride.platformCommission ?? Number((fare * (platformCommissionRate / 100)).toFixed(2));
    wooshCommission += commission;

    tipsAndIncentives += (ride.tipAmount || 0);

    const dateRef = ride.rideEndedAt || ride.createdAt;
    if (dateRef) {
      activeDaysSet.add(new Date(dateRef).toDateString());
    }

    if (ride.durationMinutes) {
      totalDurationMinutes += ride.durationMinutes;
    } else if (ride.rideStartedAt && ride.rideEndedAt) {
      totalDurationMinutes += Math.round((new Date(ride.rideEndedAt).getTime() - new Date(ride.rideStartedAt).getTime()) / 60000);
    }
  });

  const netEarnings = Number((totalRideFares - wooshCommission + tipsAndIncentives).toFixed(2));
  const calculatedOnlineHours = Number((totalDurationMinutes / 60).toFixed(1));
  const hoursOnline = profile?.onlineHours && profile.onlineHours > calculatedOnlineHours 
    ? profile.onlineHours 
    : calculatedOnlineHours;

  // Real bank payouts in this month
  const payouts = await PayoutRequest.find({
    rider: new mongoose.Types.ObjectId(userId),
    status: { $in: [PayoutStatus.APPROVED, PayoutStatus.COMPLETED] },
    $or: [
      { processedAt: { $gte: startOfMonth, $lte: endOfMonth } },
      { requestedAt: { $gte: startOfMonth, $lte: endOfMonth } }
    ]
  } as any);
  const paidToBank = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Real cash dues repaid to Woosh in this month
  const duesTransactions = await WalletTransaction.find({
    user: userId,
    $or: [
      { category: 'cash_dues_repayment' },
      { description: { $regex: /cash dues/i } }
    ],
    createdAt: { $gte: startOfMonth, $lte: endOfMonth }
  });
  const cashDuesPaid = duesTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

  // Outstanding dues based on current wallet balance
  const currentWalletBalance = profile?.walletBalance || 0;
  const duesOutstanding = currentWalletBalance < 0 ? Math.abs(currentWalletBalance) : 0;

  // Weekly Breakdown Table (1-7, 8-14, 15-21, 22-end)
  const weekRanges = [
    { startDay: 1, endDay: 7, label: `1–7 ${monthNames[month - 1]}` },
    { startDay: 8, endDay: 14, label: `8–14 ${monthNames[month - 1]}` },
    { startDay: 15, endDay: 21, label: `15–21 ${monthNames[month - 1]}` },
    { startDay: 22, endDay: lastDay, label: `22–${lastDay} ${monthNames[month - 1]}` },
  ];

  const weeklyBreakdown = weekRanges.map(wr => {
    const weekStartDate = new Date(year, month - 1, wr.startDay, 0, 0, 0, 0);
    const weekEndDate = new Date(year, month - 1, wr.endDay, 23, 59, 59, 999);

    const weekRides = rides.filter(r => {
      const d = r.rideEndedAt || r.createdAt;
      const t = new Date(d).getTime();
      return t >= weekStartDate.getTime() && t <= weekEndDate.getTime();
    });

    let weekNet = 0;
    weekRides.forEach(r => {
      const f = r.finalFare ?? r.estimatedFare ?? 0;
      const c = r.platformCommission ?? Number((f * (platformCommissionRate / 100)).toFixed(2));
      const tip = r.tipAmount || 0;
      weekNet += (f - c + tip);
    });

    return {
      weekRange: wr.label,
      rides: weekRides.length,
      netEarnings: Number(weekNet.toFixed(2))
    };
  });

  return {
    month: monthKey,
    monthLabel,
    driver: {
      name: user?.name || 'Driver Partner',
      phoneNumber: user?.phoneNumber || '',
      vehicleNumber: profile?.vehicleNumber || 'N/A',
      city: user?.city || 'India',
    },
    header: {
      netEarnings,
      rides: rides.length,
      hoursOnline,
      daysActive: activeDaysSet.size
    },
    breakdown: {
      totalRideFares: Number(totalRideFares.toFixed(2)),
      paidOnline: Number(paidOnline.toFixed(2)),
      cashCollected: Number(cashCollected.toFixed(2)),
      tipsAndIncentives: Number(tipsAndIncentives.toFixed(2)),
      wooshCommission: Number(wooshCommission.toFixed(2)),
      commissionRatePercent: platformCommissionRate,
      paidToBank: Number(paidToBank.toFixed(2)),
      cashDuesPaid: Number(cashDuesPaid.toFixed(2)),
      duesOutstanding: Number(duesOutstanding.toFixed(2))
    },
    weeklyBreakdown,
    actions: {
      viewAllRidesUrl: `/api/v1/ride/history?month=${monthKey}`,
      downloadPdfUrl: `/api/v1/rider/statement/pdf?month=${monthKey}`
    }
  };
};

/**
 * @route   GET /api/v1/payment/wallet
 * @desc    Get user's wallet balance and dues overview
 * @access  Protected
 */
export const getWallet = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const userRole = req.user?.role;

  // If user is a passenger, return passenger wallet
  if (userRole === UserRole.PASSENGER) {
    let passengerProfile = await PassengerProfile.findOne({ user: userId });
    if (!passengerProfile) {
      passengerProfile = await PassengerProfile.create({ user: userId });
    }
    res.status(200).json(
      new ApiResponse(200, 'Wallet fetched successfully', {
        walletBalance: passengerProfile.walletBalance || 0,
        cashDues: 0,
        duesOutstanding: 0,
        totalEarnings: 0,
        currency: 'INR',
      })
    );
    return;
  }

  // Rider wallet logic
  let profile = await RiderProfile.findOne({ user: userId });
  if (!profile) {
    // Graceful fallback: check if user is a passenger registered with role 'both'
    const passengerProfile = await PassengerProfile.findOne({ user: userId });
    if (passengerProfile) {
      res.status(200).json(
        new ApiResponse(200, 'Wallet fetched successfully', {
          walletBalance: passengerProfile.walletBalance || 0,
          cashDues: 0,
          duesOutstanding: 0,
          totalEarnings: 0,
          currency: 'INR',
        })
      );
      return;
    }
    throw new ApiError(404, 'Rider profile not found');
  }

  // Sync lifetime totalEarnings and totalRides from completed rides if profile was lagging
  const riderId = req.user?._id;
  const lifetime = await Ride.aggregate([
    { $match: { rider: new mongoose.Types.ObjectId(riderId), status: { $in: [RideStatus.COMPLETED, RideStatus.PAYMENT_COMPLETED] } } },
    { $group: { 
        _id: null, 
        total: { $sum: { $ifNull: ["$riderEarnings", { $subtract: ["$finalFare", { $ifNull: ["$platformCommission", { $multiply: ["$finalFare", 0.2] }] }] }] } }, 
        count: { $sum: 1 } 
      } 
    }
  ]);
  const aggregatedEarnings = Number((lifetime[0]?.total || 0).toFixed(2));
  const aggregatedRides = lifetime[0]?.count || 0;

  if (aggregatedEarnings > (profile.totalEarnings || 0) || aggregatedRides > (profile.totalRides || 0)) {
    profile.totalEarnings = Math.max(profile.totalEarnings || 0, aggregatedEarnings);
    profile.totalRides = Math.max(profile.totalRides || 0, aggregatedRides);
    await profile.save();
  }

  const balance = profile.walletBalance || 0;
  const cashDues = balance < 0 ? Math.abs(balance) : 0;

  res.status(200).json(new ApiResponse(200, 'Wallet fetched successfully', {
    walletBalance: balance,
    cashDues,
    duesOutstanding: cashDues,
    totalEarnings: profile.totalEarnings,
    currency: 'INR'
  }));
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

  const userId = req.user?._id;
  const userRole = req.user?.role;
  let newBalance = amount;

  if (userRole === UserRole.PASSENGER) {
    const passengerProfile = await PassengerProfile.findOneAndUpdate(
      { user: userId },
      { $inc: { walletBalance: amount } },
      { new: true, upsert: true }
    );
    newBalance = passengerProfile.walletBalance || amount;
  } else {
    // Rider wallet topup
    const profile = await RiderProfile.findOneAndUpdate(
      { user: userId },
      { $inc: { walletBalance: amount } },
      { new: true }
    );
    newBalance = profile?.walletBalance || amount;
  }

  await WalletTransaction.create({
    user: userId,
    type: WalletTransactionType.CREDIT,
    amount,
    description: `Wallet top-up (Txn: ${razorpay_payment_id})`,
    referenceId: razorpay_payment_id,
    category: 'topup',
    balanceAfter: newBalance,
  });

  res.status(200).json(new ApiResponse(200, `₹${amount} added to wallet`, {
    walletBalance: newBalance,
    duesOutstanding: newBalance < 0 ? Math.abs(newBalance) : 0
  }));
});

/**
 * @route   POST /api/v1/payment/cash-dues/order
 * @desc    Create Razorpay order for rider to repay cash dues to Woosh
 * @access  Protected (Rider)
 */
export const createCashDuesOrder = asyncHandler(async (req: Request, res: Response) => {
  const profile = await RiderProfile.findOne({ user: req.user?._id });
  if (!profile) throw new ApiError(404, 'Rider profile not found');

  const currentDues = profile.walletBalance < 0 ? Math.abs(profile.walletBalance) : 0;
  const amount = Number(req.body.amount || currentDues);

  if (!amount || amount <= 0) {
    throw new ApiError(400, 'You have no outstanding cash dues to pay');
  }

  const receipt = `dues_${req.user?._id}_${Date.now()}`;
  const order = await paymentService.createOrder(amount, receipt);

  res.status(200).json(new ApiResponse(200, 'Cash dues repayment order created', {
    order,
    duesOutstanding: currentDues,
    amountToPay: amount
  }));
});

/**
 * @route   POST /api/v1/payment/cash-dues/verify
 * @desc    Verify Razorpay payment for cash dues repayment
 * @access  Protected (Rider)
 */
export const verifyCashDuesPayment = asyncHandler(async (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

  const isValid = paymentService.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) throw new ApiError(400, 'Invalid payment signature');

  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) throw new ApiError(400, 'Invalid payment amount');

  const profile = await RiderProfile.findOneAndUpdate(
    { user: req.user?._id },
    { $inc: { walletBalance: payAmount } },
    { new: true }
  );

  const newBalance = profile?.walletBalance ?? 0;
  const duesOutstanding = newBalance < 0 ? Math.abs(newBalance) : 0;

  await WalletTransaction.create({
    user: req.user?._id,
    type: WalletTransactionType.CREDIT,
    amount: payAmount,
    description: `Cash dues paid to Woosh (Txn: ${razorpay_payment_id})`,
    referenceId: razorpay_payment_id,
    category: 'cash_dues_repayment',
    balanceAfter: newBalance,
  });

  res.status(200).json(new ApiResponse(200, `₹${payAmount} cash dues paid successfully`, {
    walletBalance: newBalance,
    duesOutstanding,
  }));
});

/**
 * @route   GET /api/v1/payment/transactions
 * @desc    Get paginated wallet transaction history with formatted status
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

  const formattedTransactions = transactions.map(txn => {
    const isCredit = txn.type === WalletTransactionType.CREDIT || txn.type === WalletTransactionType.TOPUP || txn.type === WalletTransactionType.REFUND;
    return {
      _id: txn._id,
      type: txn.type,
      category: txn.category || (isCredit ? 'credit' : 'debit'),
      amount: txn.amount,
      formattedAmount: `${isCredit ? '+' : '-'}₹${txn.amount}`,
      description: txn.description,
      referenceId: txn.referenceId,
      balanceAfter: txn.balanceAfter,
      isCredit,
      createdAt: txn.createdAt,
    };
  });

  res.status(200).json(new ApiResponse(200, 'Transactions fetched', {
    transactions: formattedTransactions, page, limit, total, totalPages: Math.ceil(total / limit),
  }));
});

/**
 * @route   GET /api/v1/payment/statement
 * @desc    Get rider monthly financial statement (matching UI screen)
 * @access  Protected
 */
export const getMonthlyStatement = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?._id) throw new ApiError(401, 'Unauthorized');
  const month = req.query.month as string | undefined;
  const statement = await calculateMonthlyStatementData(req.user._id.toString(), month);

  res.status(200).json(new ApiResponse(200, 'Monthly statement fetched successfully', statement));
});

/**
 * @route   GET /api/v1/payment/statement/pdf
 * @desc    Download dynamic tabular PDF statement for given month
 * @access  Protected
 */
export const downloadStatementPdf = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?._id) throw new ApiError(401, 'Unauthorized');
  const month = req.query.month as string | undefined;
  const statement = await calculateMonthlyStatementData(req.user._id.toString(), month);

  const pdfBuffer = await StatementPdfService.generateStatementBuffer(statement);

  const filename = `woosh_statement_${statement.month}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', pdfBuffer.length);

  res.status(200).end(pdfBuffer);
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

  const tipAmount = Math.max(0, Number(req.body.tipAmount || 0));
  if (tipAmount > 0) {
    ride.tipAmount = tipAmount;
  }

  let finalFare = ride.finalFare;
  if (!finalFare) {
    finalFare = ride.estimatedFare || 0;
    ride.finalFare = finalFare;
  }

  // Calculate Commission reliably from Database (strictly on finalFare, 0% on tip)
  const config = await SystemConfig.findOne();
  const platformCommissionRate = config?.platformCommissionRate ?? 20;
  const platformCommission = Number((finalFare * (platformCommissionRate / 100)).toFixed(2));
  const currentTip = ride.tipAmount || 0;
  const riderEarnings = Number((finalFare - platformCommission + currentTip).toFixed(2));

  ride.platformCommission = platformCommission;
  ride.riderEarnings = riderEarnings;

  // Split payment: only bill remaining amount plus tip
  const walletUsed = ride.walletAmountUsed || 0;
  const payableRemaining = ride.remainingAmountToPay !== undefined 
    ? ride.remainingAmountToPay 
    : Math.max(0, Number((finalFare - walletUsed).toFixed(2)));
  ride.remainingAmountToPay = payableRemaining;

  const amountToPay = Number((payableRemaining + currentTip).toFixed(2));

  if (amountToPay <= 0) {
    // Already fully covered by wallet balance and no tip
    ride.paymentStatus = PaymentStatus.PAID;
    ride.status = RideStatus.PAYMENT_COMPLETED;
    await ride.save();

    // Credit rider wallet if rider assigned
    if (ride.rider) {
      const profile = await RiderProfile.findOneAndUpdate(
        { user: ride.rider },
        { 
          $inc: { 
            walletBalance: riderEarnings,
            totalEarnings: riderEarnings,
            totalRides: 1
          } 
        },
        { new: true }
      );
      if (profile) {
        await WalletTransaction.create({
          user: ride.rider,
          type: WalletTransactionType.CREDIT,
          amount: riderEarnings,
          description: `Earnings for Ride: ${ride._id}`,
          balanceAfter: profile.walletBalance,
          referenceId: ride._id.toString(),
          category: 'ride_earnings',
        });
      }
    }

    res.status(200).json(new ApiResponse(200, 'Ride already paid in full via wallet', { 
      ride, 
      fare: finalFare, 
      walletAmountUsed: walletUsed,
      tip: currentTip, 
      total: 0 
    }));
    return;
  }

  const receipt = `receipt_ride_${id}`;
  const order = await paymentService.createOrder(amountToPay, receipt);

  ride.razorpayOrderId = order.id;
  await ride.save();

  res.status(200).json(new ApiResponse(200, 'Ride payment order created', { 
    order, 
    fare: finalFare, 
    walletAmountUsed: walletUsed,
    remainingAmountToPay: payableRemaining,
    tip: currentTip, 
    total: amountToPay 
  }));
});

/**
 * @route   POST /api/v1/payment/ride/:id/verify
 * @desc    Verify Razorpay ride payment and credit rider (including 100% tip without commission)
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

  // Idempotency: if already paid, avoid double credit
  if (ride.paymentStatus === PaymentStatus.PAID) {
    res.status(200).json(new ApiResponse(200, 'Payment already verified', { ride }));
    return;
  }

  // Calculate fare, commission, and rider share reliably
  // Platform commission is charged strictly on finalFare. 100% of tip goes to rider!
  const config = await SystemConfig.findOne();
  const platformCommissionRate = config?.platformCommissionRate ?? 20;
  const finalFare = ride.finalFare || ride.estimatedFare || 0;
  const tipAmount = ride.tipAmount || 0;
  const platformCommission = ride.platformCommission !== undefined 
    ? ride.platformCommission 
    : Number((finalFare * (platformCommissionRate / 100)).toFixed(2));
  const riderShare = Number((finalFare - platformCommission + tipAmount).toFixed(2));

  // Update ride payment status
  if (ride.paymentMethod !== PaymentMethod.WALLET) {
    ride.paymentMethod = PaymentMethod.UPI;
  }
  ride.paymentStatus = PaymentStatus.PAID;
  ride.status = RideStatus.PAYMENT_COMPLETED;
  ride.razorpayPaymentId = razorpay_payment_id;
  ride.finalFare = finalFare;
  ride.platformCommission = platformCommission;
  ride.riderEarnings = riderShare;
  await ride.save();

  // If rider exists, credit walletBalance (for withdrawal) and increment totalEarnings (lifetime view)
  if (ride.rider) {
    const profile = await RiderProfile.findOneAndUpdate(
      { user: ride.rider },
      { 
        $inc: { 
          walletBalance: riderShare,
          totalEarnings: riderShare,
          totalRides: 1
        } 
      },
      { new: true }
    );

    const newBalance = profile?.walletBalance ?? riderShare;

    await WalletTransaction.create({
      user: ride.rider,
      type: WalletTransactionType.CREDIT,
      amount: riderShare,
      description: `Earnings for Ride: ${ride._id}${tipAmount > 0 ? ` (incl. ₹${tipAmount} tip)` : ''}`,
      balanceAfter: newBalance,
      referenceId: ride._id.toString(),
      category: 'ride_earnings',
    });
  }

  // Emit socket event to notify Rider that payment is received
  import('../sockets/tracking.socket').then(({ ioInstance }) => {
    if (ioInstance && ride.rider) {
      ioInstance.to(`rider:${ride.rider.toString()}`).emit('payment_received', {
        rideId: ride._id,
        amount: finalFare + tipAmount,
        fare: finalFare,
        tip: tipAmount,
      });
    }
  }).catch(err => console.error('[Socket] Error in verifyRidePayment:', err));

  // Push notification to Rider
  if (ride.rider) {
    fcmService.sendToUser(
      ride.rider.toString(),
      '💰 Payment Received!',
      `₹${riderShare} credited to your wallet for Ride #${ride._id}${tipAmount > 0 ? ` (incl. ₹${tipAmount} tip)` : ''}.`,
      {
        type: 'PAYMENT_RECEIVED',
        rideId: ride._id.toString(),
        amount: String(riderShare),
      }
    ).catch(err => console.error('[FCM] Error in verifyRidePayment notification:', err));
  }

  res.status(200).json(new ApiResponse(200, 'Ride payment verified successfully', { ride }));
});

