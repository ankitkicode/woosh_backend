import { Request, Response } from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { Ride } from '../models/Ride';
import { RiderProfile } from '../models/RiderProfile';
import { PassengerProfile } from '../models/PassengerProfile';
import { User } from '../models/User';
import { PricingRule } from '../models/PricingRule';
import { calculateFare } from '../utils/fareCalculator';
import { mapsService } from '../services/maps.service';

import { whatsappService } from '../services/whatsapp.service';
import { DisputeCategory, PaymentMethod, PaymentStatus, RideStatus, UserRole, WalletTransactionType, CancellationBy, RIDER_SEARCH_RADIUS_KM } from '../config/constants';
import { WalletTransaction } from '../models/WalletTransaction';
import { SystemConfig } from '../models/SystemConfig';
import { paymentService } from '../services/payment.service';
import { fcmService } from '../services/fcm.service';

const generateRideOTP = (): string => String(crypto.randomInt(1000, 9999));

/**
 * @route   POST /api/v1/ride/estimate
 * @desc    Get fare estimate without booking a ride
 * @access  Protected (passenger)
 */
export const estimateFare = asyncHandler(async (req: Request, res: Response) => {
  const { pickup, drop, city } = req.body;
  const { distanceKm, durationMins } = await mapsService.getDistanceAndDuration(
    pickup.latitude, pickup.longitude, drop.latitude, drop.longitude
  );

  // Use city-wise pricing from DB, fallback to defaults
  let pricingOverrides = {};
  if (city) {
    const rule = await PricingRule.findOne({ city: city.toLowerCase(), isActive: true });
    if (rule) {
      pricingOverrides = {
        baseFare: rule.baseFare,
        costPerKm: rule.costPerKm,
        costPerMinute: rule.costPerMinute,
        isSurge: rule.isSurgeActive,
        surgeMultiplier: rule.surgeMultiplier,
      };
    }
  }

  const fare = calculateFare({ distanceKm, durationMinutes: durationMins, ...pricingOverrides });
  res.status(200).json(new ApiResponse(200, 'Fare estimated', { distanceKm, durationMinutes: durationMins, fare }));
});

/**
 * @route   POST /api/v1/ride/request
 * @desc    Book a new ride + Notify nearby riders via FCM
 * @access  Protected (passenger)
 */
export const requestRide = asyncHandler(async (req: Request, res: Response) => {
  const { pickup, drop, paymentMethod, childProfileId, city, applyWallet } = req.body;
  const { distanceKm, durationMins } = await mapsService.getDistanceAndDuration(
    pickup.latitude, pickup.longitude, drop.latitude, drop.longitude
  );

  // Use city-wise pricing from DB
  let pricingOverrides = {};
  if (city) {
    const rule = await PricingRule.findOne({ city: city.toLowerCase(), isActive: true });
    if (rule) {
      pricingOverrides = {
        baseFare: rule.baseFare,
        costPerKm: rule.costPerKm,
        costPerMinute: rule.costPerMinute,
        isSurge: rule.isSurgeActive,
        surgeMultiplier: rule.surgeMultiplier,
      };
    }
  }

  const fare = calculateFare({ distanceKm, durationMinutes: durationMins, ...pricingOverrides });

  // Handle Wallet Balance deduction if applyWallet is selected
  let walletAmountUsed = 0;
  let remainingDue = fare.totalFare;
  let initialPaymentStatus = PaymentStatus.PENDING;
  let finalPaymentMethod = paymentMethod || PaymentMethod.CASH;

  if (applyWallet) {
    const passengerProfile = await PassengerProfile.findOne({ user: req.user?._id });
    const availableWallet = passengerProfile?.walletBalance || 0;

    if (passengerProfile && availableWallet > 0) {
      walletAmountUsed = Math.min(fare.totalFare, availableWallet);
      remainingDue = Math.max(0, Number((fare.totalFare - walletAmountUsed).toFixed(2)));

      // Deduct applied wallet balance immediately
      passengerProfile.walletBalance = Number((availableWallet - walletAmountUsed).toFixed(2));
      await passengerProfile.save();

      await WalletTransaction.create({
        user: req.user?._id,
        type: WalletTransactionType.DEBIT,
        amount: walletAmountUsed,
        description: `Wallet balance applied to Ride booking`,
        category: 'ride_fare',
        balanceAfter: passengerProfile.walletBalance,
      });

      if (remainingDue === 0) {
        finalPaymentMethod = PaymentMethod.WALLET;
        initialPaymentStatus = PaymentStatus.PAID;
      }
    }
  }

  let initialAssignedRider: import('mongoose').Types.ObjectId | undefined;
  let assignmentExpiresAt: Date | undefined;
  let assignedRiderProfile: any = null;
  const notifiedRiders: import('mongoose').Types.ObjectId[] = [];

  // Find nearby online riders for assignment
  try {
    const nearbyRiders = await RiderProfile.find({
      isOnline: true,
      kycStatus: 'approved',
      currentLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [pickup.longitude, pickup.latitude] },
          $maxDistance: RIDER_SEARCH_RADIUS_KM * 1000,
        },
      },
    } as unknown as Record<string, unknown>).populate('user', '_id sessions').limit(10);

    if (nearbyRiders.length > 0) {
      const firstRider = nearbyRiders[0];
      assignedRiderProfile = firstRider;
      const riderUser = firstRider.user as any;
      initialAssignedRider = riderUser._id;
      assignmentExpiresAt = new Date(Date.now() + 120000); // 2 minutes timeout
      notifiedRiders.push(riderUser._id);
    }
  } catch (err) {
    console.error('[FCM] Error finding riders:', err);
  }

  const ride = await Ride.create({
    passenger: req.user?._id,
    pickup,
    drop,
    paymentMethod: finalPaymentMethod,
    paymentStatus: initialPaymentStatus,
    applyWallet: Boolean(applyWallet),
    walletAmountUsed,
    remainingAmountToPay: remainingDue,
    childProfile: childProfileId || undefined,
    estimatedFare: fare.totalFare,
    distanceKm,
    durationMinutes: durationMins,
    otp: generateRideOTP(),
    status: RideStatus.REQUESTED,
    isSurge: fare.isSurge,
    surgeMultiplier: fare.surgeMultiplier,
    assignedRider: initialAssignedRider,
    assignmentExpiresAt,
    notifiedRiders,
  });

  // Since we couldn't send the real ride ID earlier, let's notify the assigned rider properly now
  // if (initialAssignedRider) {
  //   const assignedRiderDoc = await User.findById(initialAssignedRider);
  //   if (assignedRiderDoc && assignedRiderDoc.phoneNumber) {
  //     await whatsappService.sendNewRideRequest(
  //       assignedRiderDoc.phoneNumber,
  //       pickup.address || 'Nearby',
  //       drop.address || 'Destination'
  //     );
  //   }
  // }    
  let pickupEstimate: any = null;
  if (assignedRiderProfile?.currentLocation?.coordinates) {
    const rLng = assignedRiderProfile.currentLocation.coordinates[0];
    const rLat = assignedRiderProfile.currentLocation.coordinates[1];
    pickupEstimate = await calculateEtaAndDistance(rLat, rLng, pickup.latitude, pickup.longitude);
  }

  const enrichedPickup = {
    ...ride.pickup,
    distanceKm: pickupEstimate?.distanceKm ?? null,
    etaMinutes: pickupEstimate?.etaMinutes ?? null,
    formattedDistance: pickupEstimate?.formattedDistance ?? null,
    formattedEta: pickupEstimate?.formattedEta ?? null
  };

  // Also emit via socket.io for real-time app update
  try {
    const { getIo } = await import('../sockets/tracking.socket');
    const ioInstance = getIo();
    if (ioInstance && initialAssignedRider) {
      console.log(`[Socket] Emitting new_ride_request to rider:${initialAssignedRider.toString()}`);
      ioInstance.to(`rider:${initialAssignedRider.toString()}`).emit('new_ride_request', {
        rideId: ride._id,
        pickup: enrichedPickup,
        drop: ride.drop,
        fare: ride.estimatedFare,
        distanceKm: ride.distanceKm,
        passengerId: ride.passenger,
      });
      console.log('[Socket] Successfully emitted new_ride_request');
    } else {
      console.error('[Socket] ioInstance is undefined in requestRide');
    }
  } catch (err) {
    console.error('[Socket] Error emitting new_ride_request:', err);
  }

  // Send Push Notification to assigned rider
  if (initialAssignedRider) {
    fcmService.sendToUser(
      initialAssignedRider.toString(),
      '🚕 New Ride Request!',
      `Pickup: ${pickup.address || 'Nearby'} • Fare: ₹${fare.totalFare}`,
      {
        type: 'RIDE_REQUESTED',
        rideId: ride._id.toString(),
        fare: String(fare.totalFare),
      }
    ).catch(err => console.error('[FCM] Error notifying rider of new request:', err));
  }


  res.status(201).json(new ApiResponse(201, 'Ride requested. Searching for riders...', {
    ...ride.toObject(),
    pickup: enrichedPickup
  }));
});

/**
 * @route   GET /api/v1/ride/nearby-riders
 * @desc    Get list of available online riders near a location
 * @access  Protected (passenger)
 */
export const getNearbyRiders = asyncHandler(async (req: Request, res: Response) => {
  const { latitude, longitude } = req.query;
  if (!latitude || !longitude) throw new ApiError(400, 'Latitude and longitude are required');

  const riderFilter = {
    isOnline: true,
    kycStatus: 'approved',
    currentLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates: [parseFloat(longitude as string), parseFloat(latitude as string)] },
        $maxDistance: RIDER_SEARCH_RADIUS_KM * 1000,
      },
    },
  } as unknown as Record<string, unknown>;

  const riders = await RiderProfile.find(riderFilter).populate('user', 'name phoneNumber').limit(10);

  res.status(200).json(new ApiResponse(200, 'Nearby riders fetched', riders));
});

/**
 * @route   PUT /api/v1/ride/:id/accept
 * @desc    Rider accepts a ride request
 * @access  Protected (rider)
 */
export const acceptRide = asyncHandler(async (req: Request, res: Response) => {
  const ride = await Ride.findOne({ _id: req.params.id, status: RideStatus.REQUESTED }).populate('passenger');
  if (!ride) throw new ApiError(404, 'Ride not found or already accepted');

  // Verify Assignment
  if (ride.assignedRider && ride.assignedRider.toString() !== req.user?._id) {
    throw new ApiError(403, 'This ride was not assigned to you');
  }

  if (ride.assignmentExpiresAt && ride.assignmentExpiresAt < new Date()) {
    throw new ApiError(400, 'Assignment expired. Searching for another rider.');
  }

  ride.rider = req.user?._id as unknown as import('mongoose').Types.ObjectId;
  ride.status = RideStatus.ACCEPTED;
  await ride.save();

  await RiderProfile.findOneAndUpdate(
    { user: req.user?._id },
    { $inc: { acceptedRides: 1, totalRideRequests: 1 } }
  );

  // Notify passenger that rider accepted
  try {
    const passengerUser = ride.passenger as any;
    
    // if (passengerUser && passengerUser.phoneNumber) {
    //   await whatsappService.sendOTP(passengerUser.phoneNumber, ride.otp);

    //   const riderDoc = await User.findById(req.user?._id);
    //   await whatsappService.sendRideAccepted(
    //     passengerUser.phoneNumber,
    //     riderDoc?.name || 'Your Rider',
    //     'Woosh Vehicle'
    //   );
    // } 
    
    // Emit via socket
    import('../sockets/tracking.socket').then(({ getIo }) => {
      const ioInstance = getIo();
      if (ioInstance) {
        ioInstance.to(`passenger:${passengerUser._id.toString()}`).emit('ride_accepted', {
          rideId: ride._id,
          riderId: ride.rider,
        });
      }
    });

    // Send FCM Push Notification to passenger
    fcmService.sendToUser(
      passengerUser._id.toString(),
      '👩‍🦰 Driver On The Way!',
      'Your driver has accepted the ride and is heading to your pickup location.',
      {
        type: 'RIDE_ACCEPTED',
        rideId: ride._id.toString(),
        otp: ride.otp,
      }
    ).catch(err => console.error('[FCM] Error notifying passenger of acceptance:', err));
  } catch (err) {
    console.error('[Notification] Error notifying passenger of acceptance:', err);
  }

  res.status(200).json(new ApiResponse(200, 'Ride accepted', ride));
});

/**
 * @route   PUT /api/v1/ride/:id/reject
 * @desc    Rider rejects a ride request
 * @access  Protected (rider)
 */
export const rejectRide = asyncHandler(async (req: Request, res: Response) => {
  const ride = await Ride.findOne({ _id: req.params.id, status: RideStatus.REQUESTED });
  if (!ride) throw new ApiError(404, 'Ride not found or already accepted');

  if (ride.assignedRider && ride.assignedRider.toString() === req.user?._id) {
    // Clear assignment so cron can pick it up immediately
    ride.assignmentExpiresAt = new Date(); 
    await ride.save();
    
    await RiderProfile.findOneAndUpdate(
      { user: req.user?._id },
      { $inc: { totalRideRequests: 1 } }
    );
  }

  res.status(200).json(new ApiResponse(200, 'Ride rejected', null));
});

/**
 * @route   PUT /api/v1/ride/:id/arrived
 * @desc    Rider marks as arrived at pickup
 * @access  Protected (rider)
 */
export const riderArrived = asyncHandler(async (req: Request, res: Response) => {
  const ride = await Ride.findOne({ _id: req.params.id, rider: req.user?._id, status: RideStatus.ACCEPTED }).populate('passenger');
  if (!ride) throw new ApiError(404, 'Ride not found');
  ride.status = RideStatus.RIDER_ARRIVED;
  ride.riderArrivedAt = new Date();
  await ride.save();

  // Notify passenger: rider has arrived + remind OTP
  // try {
  //   const passengerUser = ride.passenger as any;
  //   if (passengerUser && passengerUser.phoneNumber) {
  //     await whatsappService.sendRiderArrived(passengerUser.phoneNumber, ride.otp);
  //   }
  // } catch (err) {
  //   console.error('[WhatsApp] Error notifying passenger of arrival:', err);
  // }

  // Socket notification
  import('../sockets/tracking.socket').then(({ getIo }) => {
    const ioInstance = getIo();
    if (ioInstance) {
      ioInstance.to(`passenger:${ride.passenger.toString()}`).emit('rider_arrived', {
        rideId: ride._id,
        otp: ride.otp,
      });
    }
  });

  // Push notification: Driver arrived
  fcmService.sendToUser(
    ride.passenger.toString(),
    '📍 Driver Has Arrived!',
    `Your driver has reached the pickup location. Share OTP ${ride.otp} to start ride.`,
    {
      type: 'RIDER_ARRIVED',
      rideId: ride._id.toString(),
      otp: ride.otp,
    }
  ).catch(err => console.error('[FCM] Error in riderArrived:', err));

  res.status(200).json(new ApiResponse(200, 'Marked as arrived at pickup', ride));
});

/**
 * @route   PUT /api/v1/ride/:id/start
 * @desc    Start the ride (verify OTP)
 * @access  Protected (rider)
 */
export const startRide = asyncHandler(async (req: Request, res: Response) => {
  const { otp } = req.body;
  const ride = await Ride.findOne({ _id: req.params.id, rider: req.user?._id, status: RideStatus.RIDER_ARRIVED }).populate('passenger');
  if (!ride) throw new ApiError(404, 'Ride not found or not in correct status');
  if (ride.otp !== otp) throw new ApiError(400, 'Incorrect OTP. Ride cannot be started.');
  ride.status = RideStatus.STARTED;
  ride.rideStartedAt = new Date();
  await ride.save();

  // Socket notification
  import('../sockets/tracking.socket').then(({ getIo }) => {
    const ioInstance = getIo();
    if (ioInstance) {
      ioInstance.to(`passenger:${ride.passenger.toString()}`).emit('ride_started', {
        rideId: ride._id,
      });
    }
  });

  // Push notification: Ride started
  fcmService.sendToUser(
    ride.passenger.toString(),
    '🚀 Ride Started',
    'Your trip has started. Have a safe and comfortable ride with Woosh!',
    {
      type: 'RIDE_STARTED',
      rideId: ride._id.toString(),
    }
  ).catch(err => console.error('[FCM] Error in startRide:', err));

  res.status(200).json(new ApiResponse(200, 'Ride started', ride));
});

/**
 * @route   PUT /api/v1/ride/:id/complete
 * @desc    Complete the ride + calculate waiting charges + generate QR payment
 * @access  Protected (rider)
 */
export const completeRide = asyncHandler(async (req: Request, res: Response) => {
  const ride = await Ride.findOne({ _id: req.params.id, rider: req.user?._id, status: RideStatus.STARTED });
  if (!ride) throw new ApiError(404, 'Ride not found or not started');
  ride.rideEndedAt = new Date();

  // Calculate waiting charges (₹2/min after 3 min free wait)
  if (ride.riderArrivedAt && ride.rideStartedAt) {
    const waitMs = ride.rideStartedAt.getTime() - ride.riderArrivedAt.getTime();
    const waitMins = Math.floor(waitMs / 60000);
    const chargeableMins = Math.max(0, waitMins - 3); // 3 min free
    ride.waitingCharges = chargeableMins * 2; // ₹2/min
  }

  ride.finalFare = (ride.estimatedFare || 0) + (ride.waitingCharges || 0);

  // Calculate Platform Commission from Database Config (strictly on finalFare, 0% on tip)
  const config = await SystemConfig.findOne();
  const platformCommissionRate = config?.platformCommissionRate ?? 20;

  const finalFare = ride.finalFare || 0;
  const platformCommission = Number((finalFare * (platformCommissionRate / 100)).toFixed(2));
  const currentTip = ride.tipAmount || 0;
  const riderEarnings = Number((finalFare - platformCommission + currentTip).toFixed(2));

  ride.platformCommission = platformCommission;
  ride.riderEarnings = riderEarnings;

  // Split Payment calculation if passenger used wallet at booking
  const walletUsed = ride.walletAmountUsed || 0;
  const remainingDue = Math.max(0, Number((finalFare - walletUsed).toFixed(2)));
  ride.remainingAmountToPay = remainingDue;

  if (remainingDue === 0) {
    // Fare completely covered by wallet balance (or already paid)
    ride.paymentStatus = PaymentStatus.PAID;
    ride.status = RideStatus.PAYMENT_COMPLETED;

    // Settle rider earnings into RiderProfile.walletBalance immediately
    const riderProfile = await RiderProfile.findOne({ user: ride.rider });
    if (riderProfile) {
      riderProfile.totalRides += 1;
      riderProfile.totalEarnings += riderEarnings;
      riderProfile.walletBalance = Number(((riderProfile.walletBalance || 0) + riderEarnings).toFixed(2));

      await WalletTransaction.create({
        user: ride.rider,
        type: WalletTransactionType.CREDIT,
        amount: riderEarnings,
        description: `Full wallet payment settlement for Ride (ID: ${ride._id})`,
        referenceId: ride._id.toString(),
        category: 'ride_earnings',
        balanceAfter: riderProfile.walletBalance,
      });

      await riderProfile.save();
    }
  } else {
    ride.status = RideStatus.COMPLETED;

    // Generate Razorpay Order for online payment if not cash
    if (ride.paymentMethod !== PaymentMethod.CASH) {
      try {
        const { paymentService } = await import('../services/payment.service');
        const razorpayOrder = await paymentService.createOrder(remainingDue, `Ride-${ride._id}`);
        ride.razorpayOrderId = razorpayOrder.id;
      } catch (err: any) {
        console.error('[Razorpay] Order creation failed:', err.message);
      }
    }
  }
  await ride.save();

  // Socket notification
  import('../sockets/tracking.socket').then(({ getIo }) => {
    const ioInstance = getIo();
    if (ioInstance) {
      ioInstance.to(`passenger:${ride.passenger.toString()}`).emit('ride_completed', {
        rideId: ride._id,
        fare: ride.finalFare,
        walletAmountUsed: ride.walletAmountUsed || 0,
        remainingAmountToPay: ride.remainingAmountToPay,
        razorpayOrderId: ride.razorpayOrderId,
      });
    }
  });

  // Push notification: Ride completed
  fcmService.sendToUser(
    ride.passenger.toString(),
    '✅ Ride Completed',
    `Your trip has ended. Total Fare: ₹${ride.finalFare}. Tap to view payment & receipt.`,
    {
      type: 'RIDE_COMPLETED',
      rideId: ride._id.toString(),
      fare: String(ride.finalFare),
      remainingDue: String(ride.remainingAmountToPay ?? ride.finalFare),
    }
  ).catch(err => console.error('[FCM] Error in completeRide:', err));

  const payableRemaining = ride.remainingAmountToPay !== undefined ? ride.remainingAmountToPay : ride.finalFare;

  res.status(200).json(new ApiResponse(200, 'Ride completed', {
    ride,
    payment: {
      totalFare: ride.finalFare,
      baseFare: ride.estimatedFare,
      waitingCharges: ride.waitingCharges,
      walletAmountUsed: ride.walletAmountUsed || 0,
      remainingAmountToPay: payableRemaining,
      paymentMethod: ride.paymentMethod,
      razorpayOrderId: ride.razorpayOrderId,
      message: ride.paymentStatus === PaymentStatus.PAID 
        ? `Payment of ₹${ride.finalFare} already received (${ride.walletAmountUsed ? 'Wallet' : 'Online'}).`
        : (ride.paymentMethod === PaymentMethod.CASH
            ? (ride.walletAmountUsed && ride.walletAmountUsed > 0
                ? `Collect ₹${payableRemaining} cash from passenger (₹${ride.walletAmountUsed} paid via wallet).`
                : `Collect ₹${ride.finalFare} cash from the passenger.`)
            : `Passenger is paying remaining ₹${payableRemaining} online via Razorpay in their app.`),
    }
  }));
});

/**
 * @route   PUT /api/v1/ride/:id/confirm-payment
 * @desc    Rider confirms cash collected
 * @access  Protected (rider)
 */
export const confirmPayment = asyncHandler(async (req: Request, res: Response) => {
  const ride = await Ride.findOne({ _id: req.params.id, rider: req.user?._id, status: { $in: [RideStatus.COMPLETED, RideStatus.STARTED] } });
  if (!ride) throw new ApiError(404, 'Ride not found');
  
  if (ride.paymentMethod !== PaymentMethod.CASH && ride.paymentMethod !== PaymentMethod.WALLET) {
    throw new ApiError(400, 'This ride was not marked for cash/wallet settlement');
  }

  // Idempotency check: if already confirmed, don't double debit/credit
  if (ride.paymentStatus === PaymentStatus.PAID) {
    res.status(200).json(new ApiResponse(200, 'Payment already confirmed', ride));
    return;
  }

  // Ensure fare, commission, and riderEarnings are reliably calculated
  const config = await SystemConfig.findOne();
  const platformCommissionRate = config?.platformCommissionRate ?? 20;
  const finalFare = ride.finalFare || ride.estimatedFare || 0;
  const tipAmount = Math.max(0, Number(req.body.tipAmount || ride.tipAmount || 0));
  if (tipAmount > 0) {
    ride.tipAmount = tipAmount;
  }

  // Commission is strictly on finalFare. Zero commission on tip!
  const platformCommission = Number((finalFare * (platformCommissionRate / 100)).toFixed(2));
  const riderEarnings = Number((finalFare - platformCommission + tipAmount).toFixed(2));

  ride.finalFare = finalFare;
  ride.platformCommission = platformCommission;
  ride.riderEarnings = riderEarnings;
  ride.paymentStatus = PaymentStatus.PAID;
  ride.status = RideStatus.PAYMENT_COMPLETED;
  await ride.save();

  // Rider wallet adjustment:
  // Cash collected by rider from passenger = cashDue + tipAmount (rider keeps cash tip in pocket)
  // cashDue is remaining cash owed by passenger after wallet balance deduction
  const cashDue = ride.remainingAmountToPay !== undefined ? ride.remainingAmountToPay : finalFare;
  const walletAdjustment = Number(((riderEarnings - tipAmount) - cashDue).toFixed(2));

  const riderProfile = await RiderProfile.findOne({ user: ride.rider });
  if (riderProfile) {
    riderProfile.totalRides += 1;
    riderProfile.totalEarnings += riderEarnings;
    riderProfile.walletBalance = Number(((riderProfile.walletBalance || 0) + walletAdjustment).toFixed(2));

    if (walletAdjustment < 0) {
      // Rider collected more cash than their earnings -> commission deducted from wallet
      await WalletTransaction.create({
        user: ride.rider,
        type: WalletTransactionType.DEBIT,
        amount: Math.abs(walletAdjustment),
        description: `Platform commission for Cash Ride (ID: ${ride._id})`,
        referenceId: ride._id.toString(),
        category: 'commission_deduction',
        balanceAfter: riderProfile.walletBalance
      });
    } else if (walletAdjustment > 0) {
      // Passenger used wallet balance -> platform reimburses rider into their wallet
      await WalletTransaction.create({
        user: ride.rider,
        type: WalletTransactionType.CREDIT,
        amount: walletAdjustment,
        description: `Wallet fare settlement for Ride (ID: ${ride._id})`,
        referenceId: ride._id.toString(),
        category: 'ride_earnings',
        balanceAfter: riderProfile.walletBalance
      });
    }
    
    await riderProfile.save();
  }

  res.status(200).json(new ApiResponse(200, 'Payment confirmed', ride));
});

/**
 * @route   POST /api/v1/ride/:id/verify-digital-payment
 * @desc    Passenger verifies Razorpay payment
 * @access  Protected (passenger)
 */

export const verifyDigitalPayment = asyncHandler(async (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  
  const ride = await Ride.findOne({ _id: req.params.id, passenger: req.user?._id, status: { $in: [RideStatus.COMPLETED, RideStatus.STARTED] } });
  if (!ride) throw new ApiError(404, 'Ride not found');

  if (ride.paymentMethod === PaymentMethod.CASH) {
    throw new ApiError(400, 'This ride is not an online payment ride');
  }

  const isValid = paymentService.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  // Idempotency check: if already confirmed, don't double credit
  if (ride.paymentStatus === PaymentStatus.PAID) {
    res.status(200).json(new ApiResponse(200, 'Payment already verified', ride));
    return;
  }

  // Ensure fare, commission, and riderEarnings are reliably calculated
  const config = await SystemConfig.findOne();
  const platformCommissionRate = config?.platformCommissionRate ?? 20;
  const finalFare = ride.finalFare || ride.estimatedFare || 0;
  const tipAmount = ride.tipAmount || 0;
  const platformCommission = ride.platformCommission !== undefined 
    ? ride.platformCommission 
    : Number((finalFare * (platformCommissionRate / 100)).toFixed(2));
  const riderEarnings = ride.riderEarnings !== undefined 
    ? ride.riderEarnings 
    : Number((finalFare - platformCommission + tipAmount).toFixed(2));

  ride.finalFare = finalFare;
  ride.platformCommission = platformCommission;
  ride.riderEarnings = riderEarnings;
  ride.razorpayPaymentId = razorpay_payment_id;
  ride.paymentStatus = PaymentStatus.PAID;
  ride.status = RideStatus.PAYMENT_COMPLETED;
  await ride.save();

  // Credit earnings to rider's walletBalance (for withdrawal) and increment totalEarnings (lifetime view)
  const riderProfile = await RiderProfile.findOne({ user: ride.rider });
  if (riderProfile) {
    riderProfile.totalRides += 1;
    riderProfile.totalEarnings += riderEarnings;
    riderProfile.walletBalance = Number(((riderProfile.walletBalance || 0) + riderEarnings).toFixed(2));

    await WalletTransaction.create({
      user: ride.rider,
      type: WalletTransactionType.CREDIT,
      amount: riderEarnings,
      description: `Earnings for Digital Ride (Txn: ${razorpay_payment_id})${tipAmount > 0 ? ` (incl. ₹${tipAmount} tip)` : ''}`,
      referenceId: ride._id.toString(),
      category: 'ride_earnings',
      balanceAfter: riderProfile.walletBalance
    });
    
    await riderProfile.save();
  }

  // Notify Rider that payment was received
  import('../sockets/tracking.socket').then(({ getIo }) => {
    const ioInstance = getIo();
    if (ioInstance && ride.rider) {
      ioInstance.to(`rider:${ride.rider.toString()}`).emit('payment_received', {
        rideId: ride._id,
        amount: (ride.remainingAmountToPay !== undefined ? ride.remainingAmountToPay : finalFare) + tipAmount,
        fare: finalFare,
        tip: tipAmount,
      });
    }
  });

  // Push notification: Rider earnings credited
  if (ride.rider) {
    fcmService.sendToUser(
      ride.rider.toString(),
      '💰 Payment Received!',
      `₹${riderEarnings} has been credited to your wallet for Ride #${ride._id}${tipAmount > 0 ? ` (includes ₹${tipAmount} tip)` : ''}.`,
      {
        type: 'PAYMENT_RECEIVED',
        rideId: ride._id.toString(),
        amount: String(riderEarnings),
      }
    ).catch(err => console.error('[FCM] Error in verifyDigitalPayment:', err));
  }

  res.status(200).json(new ApiResponse(200, 'Payment verified successfully', ride));
});

/**
 * @route   PUT /api/v1/ride/:id/cancel
 * @desc    Cancel a ride (passenger or rider)
 * @access  Protected
 */
export const cancelRide = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body;
  const ride = await Ride.findOne({
    _id: req.params.id,
    status: { $in: [RideStatus.REQUESTED, RideStatus.ACCEPTED, RideStatus.RIDER_ARRIVED] },
  });
  if (!ride) throw new ApiError(404, 'Ride cannot be cancelled at this stage');

  const cancelledBy =
    ride.passenger.toString() === req.user?._id ? CancellationBy.PASSENGER : CancellationBy.RIDER;

  ride.status = cancelledBy === CancellationBy.PASSENGER ? RideStatus.PASSENGER_CANCELLED : RideStatus.RIDER_CANCELLED;
  ride.cancellation = { cancelledBy, reason, cancelledAt: new Date() };

  // Refund applied wallet balance if ride is cancelled before completion
  if (ride.walletAmountUsed && ride.walletAmountUsed > 0) {
    const passengerProfile = await PassengerProfile.findOne({ user: ride.passenger });
    if (passengerProfile) {
      passengerProfile.walletBalance = Number(((passengerProfile.walletBalance || 0) + ride.walletAmountUsed).toFixed(2));
      await passengerProfile.save();

      await WalletTransaction.create({
        user: ride.passenger,
        type: WalletTransactionType.CREDIT,
        amount: ride.walletAmountUsed,
        description: `Refund for cancelled ride (ID: ${ride._id})`,
        referenceId: ride._id.toString(),
        category: 'refund',
        balanceAfter: passengerProfile.walletBalance,
      });
    }
  }

  await ride.save();

  // Notify the other party if assigned, or broadcast cancellation
  import('../sockets/tracking.socket').then(({ getIo }) => {
    const ioInstance = getIo();
    if (ioInstance) {
      if (ride.rider) {
        ioInstance.to(`rider:${ride.rider}`).emit('ride_cancelled', { rideId: ride._id, cancelledBy, reason });
        ioInstance.to(`passenger:${ride.passenger}`).emit('ride_cancelled', { rideId: ride._id, cancelledBy, reason });
      } else {
        // If no rider accepted yet, broadcast to the rider_room so nearby riders can remove the request
        ioInstance.to('rider_room').emit('ride_cancelled', { rideId: ride._id, cancelledBy, reason });
      }
    }
  });

  // Push notification: Ride cancelled
  const recipientId = cancelledBy === CancellationBy.PASSENGER ? ride.rider : ride.passenger;
  if (recipientId) {
    fcmService.sendToUser(
      recipientId.toString(),
      '❌ Ride Cancelled',
      `Ride #${ride._id} was cancelled by ${cancelledBy.toLowerCase()}.${reason ? ` Reason: ${reason}` : ''}`,
      {
        type: 'RIDE_CANCELLED',
        rideId: ride._id.toString(),
        cancelledBy,
      }
    ).catch(err => console.error('[FCM] Error in cancelRide notification:', err));
  }

  res.status(200).json(new ApiResponse(200, 'Ride cancelled', ride));
});



/**
 * @route   PUT /api/v1/ride/:id/rate
 * @desc    Rate the ride (passenger rates rider OR rider rates passenger)
 * @access  Protected
 */
export const rateRide = asyncHandler(async (req: Request, res: Response) => {
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) throw new ApiError(400, 'Rating must be between 1 and 5');

  const ride = await Ride.findById(req.params.id);
  if (!ride) throw new ApiError(404, 'Ride not found');
  if (ride.status !== RideStatus.COMPLETED && ride.status !== RideStatus.PAYMENT_COMPLETED) {
    throw new ApiError(400, 'Only completed rides can be rated');
  }

  const isPassenger = ride.passenger.toString() === req.user?._id;

  if (isPassenger) {
    if (ride.rating?.passengerRating) throw new ApiError(400, 'You have already rated this ride');
    ride.rating = { ...ride.rating, passengerRating: rating, passengerComment: comment };

    // Update rider's average rating
    if (ride.rider) {
      const riderProfile = await RiderProfile.findOne({ user: ride.rider });
      if (riderProfile) {
        const newTotalRatings = riderProfile.totalRatings + 1;
        const newAvgRating = ((riderProfile.rating * riderProfile.totalRatings) + rating) / newTotalRatings;
        riderProfile.rating = parseFloat(newAvgRating.toFixed(2));
        riderProfile.totalRatings = newTotalRatings;
        await riderProfile.save();
      }
    }
  } else {
    if (ride.rating?.riderRating) throw new ApiError(400, 'You have already rated this ride');
    ride.rating = { ...ride.rating, riderRating: rating, riderComment: comment };
  }

  await ride.save();
  res.status(200).json(new ApiResponse(200, 'Rating submitted', ride.rating));
});

/**
 * Helper to calculate distance and ETA between two coordinates using Google Maps or Haversine fallback
 */
const calculateEtaAndDistance = async (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
) => {
  try {
    const { mapsService } = await import('../services/maps.service');
    const res = await mapsService.getDistanceAndDuration(fromLat, fromLng, toLat, toLng);
    const distKm = parseFloat(res.distanceKm.toFixed(2));
    const mins = Math.max(1, Math.round(res.durationMins));
    return {
      distanceKm: distKm,
      etaMinutes: mins,
      formattedDistance: `${distKm} km`,
      formattedEta: `${mins} min${mins > 1 ? 's' : ''}`
    };
  } catch (err) {
    const { getDistanceInKm } = await import('../utils/fareCalculator');
    const distKm = getDistanceInKm(fromLat, fromLng, toLat, toLng);
    const mins = Math.max(1, Math.ceil((distKm / 25) * 60)); // Avg 25 km/h in city traffic
    return {
      distanceKm: distKm,
      etaMinutes: mins,
      formattedDistance: `${distKm} km`,
      formattedEta: `${mins} min${mins > 1 ? 's' : ''}`
    };
  }
};

/**
 * @route   GET /api/v1/ride/active
 * @desc    Get currently active/ongoing ride for rider or passenger (restores booking on app open with pickup ETA & distance)
 * @access  Protected
 */
export const getActiveRide = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;

  const queryLat = req.query.latitude ? parseFloat(req.query.latitude as string) : undefined;
  const queryLng = req.query.longitude ? parseFloat(req.query.longitude as string) : undefined;

  // Find active ongoing ride for either rider or passenger
  const activeRide = await Ride.findOne({
    $or: [
      {
        rider: userId,
        status: { 
          $in: [
            RideStatus.ACCEPTED, 
            RideStatus.RIDER_ARRIVED, 
            RideStatus.STARTED,
            RideStatus.COMPLETED // in case cash confirmation is pending
          ] 
        },
        paymentStatus: { $ne: PaymentStatus.PAID }
      },
      {
        passenger: userId,
        status: { 
          $in: [
            RideStatus.REQUESTED, 
            RideStatus.ACCEPTED, 
            RideStatus.RIDER_ARRIVED, 
            RideStatus.STARTED 
          ] 
        }
      }
    ]
  })
    .sort({ createdAt: -1 })
    .populate('passenger', 'name phoneNumber')
    .populate('rider', 'name phoneNumber');

  if (!activeRide) {
    res.status(200).json(new ApiResponse(200, 'No active ride found', {
      hasActiveRide: false,
      ride: null
    }));
    return;
  }

  let riderProfile: any = null;
  let riderLat = queryLat;
  let riderLng = queryLng;

  if (activeRide.rider) {
    riderProfile = await RiderProfile.findOne({ user: (activeRide.rider as any)._id || activeRide.rider })
      .select('vehicleNumber vehicleModel vehicleColor profileImage rating totalRatings currentLocation');
    
    // Fallback to riderProfile.currentLocation if query params not provided
    if ((riderLat === undefined || riderLng === undefined) && riderProfile?.currentLocation?.coordinates) {
      riderLng = riderProfile.currentLocation.coordinates[0];
      riderLat = riderProfile.currentLocation.coordinates[1];
    }
  }

  // Calculate Pickup Estimate (Rider -> Pickup point)
  let pickupEstimate: any = null;
  if (riderLat !== undefined && riderLng !== undefined && activeRide.pickup?.latitude && activeRide.pickup?.longitude) {
    pickupEstimate = await calculateEtaAndDistance(
      riderLat,
      riderLng,
      activeRide.pickup.latitude,
      activeRide.pickup.longitude
    );
  }

  // Calculate Drop Estimate (Rider -> Drop point) when ride is started
  let dropEstimate: any = null;
  if (activeRide.status === RideStatus.STARTED && activeRide.drop?.latitude && activeRide.drop?.longitude) {
    const originLat = riderLat !== undefined ? riderLat : activeRide.pickup.latitude;
    const originLng = riderLng !== undefined ? riderLng : activeRide.pickup.longitude;
    dropEstimate = await calculateEtaAndDistance(
      originLat,
      originLng,
      activeRide.drop.latitude,
      activeRide.drop.longitude
    );
  }

  const rideData = activeRide.toObject();

  // Enrich pickup with distance and ETA for direct display on rider screen
  const enrichedPickup = {
    ...rideData.pickup,
    distanceKm: pickupEstimate?.distanceKm ?? null,
    etaMinutes: pickupEstimate?.etaMinutes ?? null,
    formattedDistance: pickupEstimate?.formattedDistance ?? null,
    formattedEta: pickupEstimate?.formattedEta ?? null
  };

  res.status(200).json(new ApiResponse(200, 'Active ride found', {
    hasActiveRide: true,
    ride: {
      ...rideData,
      pickup: enrichedPickup,
      dropEstimate,
      riderProfile: riderProfile ? {
        vehicleNumber: riderProfile.vehicleNumber,
        vehicleModel: riderProfile.vehicleModel,
        vehicleColor: riderProfile.vehicleColor,
        profileImage: riderProfile.profileImage,
        rating: riderProfile.rating,
        totalRatings: riderProfile.totalRatings,
        currentLocation: riderProfile.currentLocation
      } : undefined
    }
  }));
});

/**
 * @route   GET /api/v1/ride/:id
 * @desc    Get a single ride's details with pickup ETA & distance
 * @access  Protected
 */
export const getRideDetails = asyncHandler(async (req: Request, res: Response) => {
  const ride = await Ride.findById(req.params.id)
    .populate('passenger', 'name phoneNumber')
    .populate('rider', 'name phoneNumber');
  if (!ride) throw new ApiError(404, 'Ride not found');

  const queryLat = req.query.latitude ? parseFloat(req.query.latitude as string) : undefined;
  const queryLng = req.query.longitude ? parseFloat(req.query.longitude as string) : undefined;

  let riderProfile: any = null;
  let riderLat = queryLat;
  let riderLng = queryLng;

  if (ride.rider) {
    riderProfile = await RiderProfile.findOne({ user: (ride.rider as any)._id || ride.rider })
      .select('vehicleNumber vehicleModel vehicleColor profileImage rating totalRatings currentLocation');
    
    if ((riderLat === undefined || riderLng === undefined) && riderProfile?.currentLocation?.coordinates) {
      riderLng = riderProfile.currentLocation.coordinates[0];
      riderLat = riderProfile.currentLocation.coordinates[1];
    }
  }

  let pickupEstimate: any = null;
  if (riderLat !== undefined && riderLng !== undefined && ride.pickup?.latitude && ride.pickup?.longitude) {
    pickupEstimate = await calculateEtaAndDistance(
      riderLat,
      riderLng,
      ride.pickup.latitude,
      ride.pickup.longitude
    );
  }

  const rideData = ride.toObject();
  const enrichedPickup = {
    ...rideData.pickup,
    distanceKm: pickupEstimate?.distanceKm ?? null,
    etaMinutes: pickupEstimate?.etaMinutes ?? null,
    formattedDistance: pickupEstimate?.formattedDistance ?? null,
    formattedEta: pickupEstimate?.formattedEta ?? null
  };

  res.status(200).json(new ApiResponse(200, 'Ride details fetched', {
    ...rideData,
    pickup: enrichedPickup,
    riderProfile: riderProfile || undefined
  }));
});

/**
 * @route   GET /api/v1/ride/history
 * @desc    Get user's ride history (paginated)
 * @access  Protected
 */
export const getRideHistory = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const filter = req.query.filter as string; // 'online_paid', 'cash', 'cancelled', 'all'
  const skip = (page - 1) * limit;

  let query: any = { $or: [{ rider: req.user?._id }, { passenger: req.user?._id }] };

  if (filter === 'online_paid') {
    query.paymentMethod = 'upi';
    query.status = RideStatus.PAYMENT_COMPLETED;
  } else if (filter === 'cash') {
    query.paymentMethod = 'cash';
    query.status = RideStatus.COMPLETED;
  } else if (filter === 'cancelled') {
    query.status = { $in: [RideStatus.RIDER_CANCELLED, RideStatus.PASSENGER_CANCELLED] };
  }

  const [rides, total] = await Promise.all([
    Ride.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('passenger', 'name').populate('rider', 'name'),
    Ride.countDocuments(query),
  ]);
  console.log(rides, total);

  res.status(200).json(new ApiResponse(200, 'Ride history fetched', {
    rides, page, limit, total, totalPages: Math.ceil(total / limit),
  }));
});

/**
 * @route   GET /api/v1/ride/high-demand
 * @desc    Get recent ride pickup locations to show high demand (heatmap) areas
 * @access  Protected (rider)
 */
export const getHighDemandAreas = asyncHandler(async (req: Request, res: Response) => {
  // Get rides from the last 12 hours
  const hoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  
  const rides = await Ride.find({
    createdAt: { $gte: hoursAgo }
  }).select('pickup.latitude pickup.longitude pickup.address');

  // Group by address to consolidate nearby rides into a single location with higher weight
  const demandMap = new Map<string, { latitude: number, longitude: number, address: string, weight: number }>();

  rides.forEach(r => {
    // Using a rounded coordinate (approx 1km radius) or address as a unique key for grouping
    const latRound = (r.pickup.latitude).toFixed(2);
    const lngRound = (r.pickup.longitude).toFixed(2);
    const key = `${latRound},${lngRound}`; // groups rides within the same ~1km area
    
    if (demandMap.has(key)) {
      const existing = demandMap.get(key)!;
      existing.weight += 1; // Increase demand weight
    } else {
      demandMap.set(key, {
        latitude: r.pickup.latitude,
        longitude: r.pickup.longitude,
        address: r.pickup.address || 'Unknown',
        weight: 1
      });
    }
  });

  // Convert map to array and sort by weight (highest demand first)
  const demandPoints = Array.from(demandMap.values()).sort((a, b) => b.weight - a.weight);

  // If you only want the absolute highest demand location, you can take demandPoints[0]
  res.status(200).json(new ApiResponse(200, 'High demand areas fetched', demandPoints));
});

/**
 * @route   PUT /api/v1/ride/:id/apply-wallet
 * @desc    Passenger applies or unapplies wallet balance to an active/completed ride before paying
 * @access  Protected (Passenger)
 */
export const applyWalletToRide = asyncHandler(async (req: Request, res: Response) => {
  const { apply = true } = req.body;
  const rideId = req.params.id;

  const ride = await Ride.findById(rideId);
  if (!ride) throw new ApiError(404, 'Ride not found');

  if (ride.passenger.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, 'Not authorized for this ride');
  }

  // Cannot modify if ride was cancelled
  if (
    ride.status === RideStatus.PASSENGER_CANCELLED ||
    ride.status === RideStatus.RIDER_CANCELLED
  ) {
    throw new ApiError(400, 'Cannot apply wallet balance to a cancelled ride');
  }

  // If already fully paid and finalized, prevent altering
  if (ride.paymentStatus === PaymentStatus.PAID && ride.status === RideStatus.PAYMENT_COMPLETED) {
    throw new ApiError(400, 'Payment for this ride is already completed');
  }

  const passengerProfile = await PassengerProfile.findOne({ user: req.user?._id });
  if (!passengerProfile) {
    throw new ApiError(404, 'Passenger profile not found');
  }

  const totalFare = ride.finalFare || ride.estimatedFare || 0;
  if (totalFare <= 0) {
    throw new ApiError(400, 'Invalid ride fare');
  }

  const currentWalletUsed = ride.walletAmountUsed || 0;

  if (apply) {
    // Passenger wants to apply wallet balance
    const effectiveAvailableBalance = Number(((passengerProfile.walletBalance || 0) + currentWalletUsed).toFixed(2));

    if (effectiveAvailableBalance <= 0) {
      throw new ApiError(400, 'Insufficient wallet balance to apply');
    }

    const newWalletToUse = Math.min(totalFare, effectiveAvailableBalance);
    const diff = Number((newWalletToUse - currentWalletUsed).toFixed(2));

    if (diff > 0) {
      passengerProfile.walletBalance = Number(((passengerProfile.walletBalance || 0) - diff).toFixed(2));
      await passengerProfile.save();

      await WalletTransaction.create({
        user: req.user?._id,
        type: WalletTransactionType.DEBIT,
        amount: diff,
        description: `Wallet balance applied to Ride #${ride._id}`,
        category: 'ride_fare',
        balanceAfter: passengerProfile.walletBalance,
        referenceId: ride._id.toString(),
      });
    } else if (diff < 0) {
      const refund = Math.abs(diff);
      passengerProfile.walletBalance = Number(((passengerProfile.walletBalance || 0) + refund).toFixed(2));
      await passengerProfile.save();

      await WalletTransaction.create({
        user: req.user?._id,
        type: WalletTransactionType.CREDIT,
        amount: refund,
        description: `Wallet balance adjustment for Ride #${ride._id}`,
        category: 'refund',
        balanceAfter: passengerProfile.walletBalance,
        referenceId: ride._id.toString(),
      });
    }

    const remainingDue = Math.max(0, Number((totalFare - newWalletToUse).toFixed(2)));

    ride.applyWallet = true;
    ride.walletAmountUsed = newWalletToUse;
    ride.remainingAmountToPay = remainingDue;

    if (remainingDue === 0) {
      ride.paymentMethod = PaymentMethod.WALLET;

      // If ride is already completed by rider, mark PAID & settle rider earnings immediately
      if (ride.status === RideStatus.COMPLETED) {
        ride.paymentStatus = PaymentStatus.PAID;
        ride.status = RideStatus.PAYMENT_COMPLETED;

        const config = await SystemConfig.findOne();
        const platformCommissionRate = config?.platformCommissionRate ?? 20;
        const commission = Number((totalFare * (platformCommissionRate / 100)).toFixed(2));
        const tip = ride.tipAmount || 0;
        const riderEarnings = Number((totalFare - commission + tip).toFixed(2));

        ride.platformCommission = commission;
        ride.riderEarnings = riderEarnings;

        if (ride.rider) {
          const riderProfile = await RiderProfile.findOne({ user: ride.rider });
          if (riderProfile) {
            riderProfile.totalRides += 1;
            riderProfile.totalEarnings += riderEarnings;
            riderProfile.walletBalance = Number(((riderProfile.walletBalance || 0) + riderEarnings).toFixed(2));

            await WalletTransaction.create({
              user: ride.rider,
              type: WalletTransactionType.CREDIT,
              amount: riderEarnings,
              description: `Full wallet payment settlement for Ride #${ride._id}`,
              referenceId: ride._id.toString(),
              category: 'ride_earnings',
              balanceAfter: riderProfile.walletBalance,
            });

            await riderProfile.save();
          }
        }
      }
    }

    await ride.save();

    // Socket notification to rider with updated payable cash
    if (ride.rider) {
      import('../sockets/tracking.socket').then(({ getIo }) => {
        const ioInstance = getIo();
        if (ioInstance) {
          ioInstance.to(`rider:${ride.rider}`).emit('ride_payment_updated', {
            rideId: ride._id,
            totalFare,
            walletAmountUsed: newWalletToUse,
            remainingAmountToPay: remainingDue,
            paymentStatus: ride.paymentStatus,
          });
        }
      });
    }

    res.status(200).json(new ApiResponse(200, 'Wallet balance applied successfully', {
      rideId: ride._id,
      totalFare,
      walletAmountUsed: newWalletToUse,
      remainingAmountToPay: remainingDue,
      passengerWalletBalance: passengerProfile.walletBalance,
      paymentStatus: ride.paymentStatus,
      status: ride.status,
    }));
  } else {
    // Passenger wants to unapply wallet balance
    if (currentWalletUsed <= 0) {
      throw new ApiError(400, 'No wallet balance is currently applied to this ride');
    }

    passengerProfile.walletBalance = Number(((passengerProfile.walletBalance || 0) + currentWalletUsed).toFixed(2));
    await passengerProfile.save();

    await WalletTransaction.create({
      user: req.user?._id,
      type: WalletTransactionType.CREDIT,
      amount: currentWalletUsed,
      description: `Wallet balance unapplied from Ride #${ride._id}`,
      category: 'refund',
      balanceAfter: passengerProfile.walletBalance,
      referenceId: ride._id.toString(),
    });

    ride.applyWallet = false;
    ride.walletAmountUsed = 0;
    ride.remainingAmountToPay = totalFare;

    if (ride.paymentMethod === PaymentMethod.WALLET) {
      ride.paymentMethod = PaymentMethod.CASH;
      ride.paymentStatus = PaymentStatus.PENDING;
    }

    await ride.save();

    // Socket notification to rider
    if (ride.rider) {
      import('../sockets/tracking.socket').then(({ getIo }) => {
        const ioInstance = getIo();
        if (ioInstance) {
          ioInstance.to(`rider:${ride.rider}`).emit('ride_payment_updated', {
            rideId: ride._id,
            totalFare,
            walletAmountUsed: 0,
            remainingAmountToPay: totalFare,
            paymentStatus: ride.paymentStatus,
          });
        }
      });
    }

    res.status(200).json(new ApiResponse(200, 'Wallet balance removed from ride', {
      rideId: ride._id,
      totalFare,
      walletAmountUsed: 0,
      remainingAmountToPay: totalFare,
      passengerWalletBalance: passengerProfile.walletBalance,
      paymentStatus: ride.paymentStatus,
      status: ride.status,
    }));
  }
});

