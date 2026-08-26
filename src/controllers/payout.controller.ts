import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { RiderProfile } from '../models/RiderProfile';

/**
 * @route   POST /api/v1/admin/payouts/process-weekly
 * @desc    Process weekly payouts for riders
 * @access  Protected (admin/super-admin)
 */
export const processWeeklyPayouts = asyncHandler(async (req: Request, res: Response) => {
  // Find all riders with a wallet balance > 0
  const riders = await RiderProfile.find({ walletBalance: { $gt: 0 } }).populate('user', 'name phoneNumber');

  let totalPayoutAmount = 0;
  const processedRiders = [];

  for (const rider of riders) {
    const payoutAmount = rider.walletBalance;
    totalPayoutAmount += payoutAmount;

    // TODO: Integrate with payment gateway (e.g. RazorpayX, Stripe Connect) to transfer funds
    // await paymentGateway.transferFunds(rider.bankAccountDetails, payoutAmount);

    // Reset wallet balance after successful payout
    rider.walletBalance = 0;
    await rider.save();

    processedRiders.push({
      riderId: rider._id,
      name: (rider.user as any)?.name || 'Unknown',
      amount: payoutAmount,
      status: 'Processed'
    });
  }

  res.status(200).json(new ApiResponse(200, 'Weekly payouts processed successfully', {
    totalPayoutAmount,
    payoutCount: processedRiders.length,
    processedRiders
  }));
});
