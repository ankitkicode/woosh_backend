import { Request, Response } from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { Ride } from '../models/Ride';
import { RiderProfile } from '../models/RiderProfile';
import { User } from '../models/User';
import { PricingRule } from '../models/PricingRule';
import { calculateFare } from '../utils/fareCalculator';
import { mapsService } from '../services/maps.service';

import { whatsappService } from '../services/whatsapp.service';
import { DisputeCategory, PaymentMethod, PaymentStatus, RideStatus, UserRole, WalletTransactionType, CancellationBy, RIDER_SEARCH_RADIUS_KM } from '../config/constants';
import { WalletTransaction } from '../models/WalletTransaction';
import { SystemConfig } from '../models/SystemConfig';
import { paymentService } from '../services/payment.service';

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
  const { pickup, drop, paymentMethod, childProfileId, city } = req.body;
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

  let initialAssignedRider: import('mongoose').Types.ObjectId | undefined;
  let assignmentExpiresAt: Date | undefined;
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
      const riderUser = firstRider.user as any;
      initialAssignedRider = riderUser._id;
      assignmentExpiresAt = new Date(Date.now() + 30000); // 30 seconds timeout
      notifiedRiders.push(riderUser._id);
    }
  } catch (err) {
    console.error('[FCM] Error finding riders:', err);
  }

  const ride = await Ride.create({
    passenger: req.user?._id,
    pickup,
    drop,
    paymentMethod,
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
      // Also emit via socket.io for real-time app update
      try {
        const { ioInstance } = await import('../sockets/tracking.socket');
        if (ioInstance && initialAssignedRider) {
          console.log(`[Socket] Emitting new_ride_request to rider:${initialAssignedRider.toString()}`);
          ioInstance.to(`rider:${initialAssignedRider.toString()}`).emit('new_ride_request', {
            rideId: ride._id,
            pickup: ride.pickup,
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


  res.status(201).json(new ApiResponse(201, 'Ride requested. Searching for riders...', ride));
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
    import('../sockets/tracking.socket').then(({ ioInstance }) => {
      if (ioInstance) {
        ioInstance.to(`passenger:${passengerUser._id.toString()}`).emit('ride_accepted', {
          rideId: ride._id,
          riderId: ride.rider,
        });
      }
    });
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
  import('../sockets/tracking.socket').then(({ ioInstance }) => {
    if (ioInstance) {
      ioInstance.to(`passenger:${ride.passenger.toString()}`).emit('rider_arrived', {
        rideId: ride._id,
        otp: ride.otp,
      });
    }
  });

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

  // const passengerUser = ride.passenger as any;
  // if (passengerUser && passengerUser.phoneNumber) {
  //   // Send WhatsApp Ride Started
  //   await whatsappService.sendRideStarted(passengerUser.phoneNumber);
  //   // Send WhatsApp Live Tracking Link to Passenger
  //   await whatsappService.sendRideTrackingLink(
  //     passengerUser.phoneNumber, 
  //     `https://woosh.com/track/${ride._id}`
  //   );
  // }

  // Socket notification
  import('../sockets/tracking.socket').then(({ ioInstance }) => {
    if (ioInstance) {
      ioInstance.to(`passenger:${ride.passenger.toString()}`).emit('ride_started', {
        rideId: ride._id,
      });
    }
  });

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
  ride.status = RideStatus.COMPLETED;
  ride.rideEndedAt = new Date();

  // Calculate waiting charges (₹2/min after 3 min free wait)
  if (ride.riderArrivedAt && ride.rideStartedAt) {
    const waitMs = ride.rideStartedAt.getTime() - ride.riderArrivedAt.getTime();
    const waitMins = Math.floor(waitMs / 60000);
    const chargeableMins = Math.max(0, waitMins - 3); // 3 min free
    ride.waitingCharges = chargeableMins * 2; // ₹2/min
  }

  ride.finalFare = (ride.estimatedFare || 0) + (ride.waitingCharges || 0);

  // Calculate Platform Commission
  let platformCommissionRate = 20;
  const config = await SystemConfig.findOne();
  if (config && config.platformCommissionRate) {
    platformCommissionRate = config.platformCommissionRate;
  }
  
  const finalFare = ride.finalFare || 0;
  const platformCommission = Number((finalFare * (platformCommissionRate / 100)).toFixed(2));
  const riderEarnings = Number((finalFare - platformCommission).toFixed(2));
  
  ride.platformCommission = platformCommission;
  ride.riderEarnings = riderEarnings;

  // Generate Razorpay Order
  let razorpayOrder = null;
  if (ride.paymentMethod === PaymentMethod.UPI || ride.paymentMethod === PaymentMethod.CREDIT_CARD || ride.paymentMethod === PaymentMethod.DEBIT_CARD || ride.paymentMethod === PaymentMethod.NET_BANKING) {
    try {
      razorpayOrder = await paymentService.createOrder(finalFare, `Ride-${ride._id}`);
      ride.razorpayOrderId = razorpayOrder.id;
    } catch (err: any) {
      console.error('[Razorpay] Order creation failed:', err.message);
    }
  }

  await ride.save();

  // Notify passenger that ride is complete
  // try {
  //   const passengerUser = ride.passenger as any;
  //   if (passengerUser && passengerUser.phoneNumber) {
  // await whatsappService.sendRideCompleted(passengerUser.phoneNumber, ride.finalFare);
  //   }
  // } catch (err) {
  //   console.error('[FCM] Error notifying passenger of completion:', err);
  // }

  // Socket notification
  import('../sockets/tracking.socket').then(({ ioInstance }) => {
    if (ioInstance) {
      ioInstance.to(`passenger:${ride.passenger.toString()}`).emit('ride_completed', {
        rideId: ride._id,
        fare: ride.finalFare,
        razorpayOrderId: ride.razorpayOrderId
      });
    }
  });

  res.status(200).json(new ApiResponse(200, 'Ride completed', {
    ride,
    payment: {
      totalFare: ride.finalFare,
      baseFare: ride.estimatedFare,
      waitingCharges: ride.waitingCharges,
      paymentMethod: ride.paymentMethod,
      razorpayOrderId: ride.razorpayOrderId,
      message: ride.paymentMethod === PaymentMethod.CASH
        ? `Collect ₹${ride.finalFare} cash from the passenger.`
        : 'Passenger is paying online via Razorpay in their app.',
    }
  }));
});

/**
 * @route   PUT /api/v1/ride/:id/confirm-payment
 * @desc    Rider confirms cash collected
 * @access  Protected (rider)
 */
export const confirmPayment = asyncHandler(async (req: Request, res: Response) => {
  const ride = await Ride.findOne({ _id: req.params.id, rider: req.user?._id, status: RideStatus.COMPLETED });
  if (!ride) throw new ApiError(404, 'Ride not found or not completed');
  
  if (ride.paymentMethod !== PaymentMethod.CASH) {
    throw new ApiError(400, 'This ride was not marked as CASH');
  }

  // Deduct platform commission from rider's wallet
  const riderProfile = await RiderProfile.findOne({ user: ride.rider });
  if (riderProfile) {
    riderProfile.totalRides += 1;
    riderProfile.totalEarnings += ride.riderEarnings || 0;
    riderProfile.walletBalance -= (ride.platformCommission || 0);

    await WalletTransaction.create({
      user: ride.rider,
      type: WalletTransactionType.DEBIT,
      amount: ride.platformCommission || 0,
      description: `Platform commission for Cash Ride (ID: ${ride._id})`,
      referenceId: ride._id.toString(),
      balanceAfter: riderProfile.walletBalance
    });
    
    await riderProfile.save();
  }

  // Set the payment status to paid
  ride.paymentStatus = PaymentStatus.PAID;
  ride.status = RideStatus.PAYMENT_COMPLETED;
  await ride.save();

  res.status(200).json(new ApiResponse(200, 'Payment confirmed', ride));
});

/**
 * @route   POST /api/v1/ride/:id/verify-digital-payment
 * @desc    Passenger verifies Razorpay payment
 * @access  Protected (passenger)
 */
export const verifyDigitalPayment = asyncHandler(async (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  
  const ride = await Ride.findOne({ _id: req.params.id, passenger: req.user?._id, status: RideStatus.COMPLETED });
  if (!ride) throw new ApiError(404, 'Ride not found or not completed');

  if (ride.paymentMethod === PaymentMethod.CASH) {
    throw new ApiError(400, 'This ride is not an online payment ride');
  }

  const isValid = paymentService.verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  // Credit earnings to rider's wallet
  const riderProfile = await RiderProfile.findOne({ user: ride.rider });
  if (riderProfile) {
    riderProfile.totalRides += 1;
    riderProfile.totalEarnings += ride.riderEarnings || 0;
    riderProfile.walletBalance += (ride.riderEarnings || 0);

    await WalletTransaction.create({
      user: ride.rider,
      type: WalletTransactionType.PAYOUT,
      amount: ride.riderEarnings || 0,
      description: `Earnings for Digital Ride (Txn: ${razorpay_payment_id})`,
      referenceId: ride._id.toString(),
      balanceAfter: riderProfile.walletBalance
    });
    
    await riderProfile.save();
  }

  ride.razorpayPaymentId = razorpay_payment_id;
  ride.paymentStatus = PaymentStatus.PAID;
  ride.status = RideStatus.PAYMENT_COMPLETED;
  await ride.save();

  // Notify Rider that payment was received
  import('../sockets/tracking.socket').then(({ ioInstance }) => {
    if (ioInstance && ride.rider) {
      ioInstance.to(`rider:${ride.rider.toString()}`).emit('payment_received', {
        rideId: ride._id,
        amount: ride.finalFare,
      });
    }
  });

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
  await ride.save();

  // Notify the other party if assigned, or broadcast cancellation
  import('../sockets/tracking.socket').then(({ ioInstance }) => {
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

  res.status(200).json(new ApiResponse(200, 'Ride cancelled', ride));
});

/**
 * @route   POST /api/v1/ride/:id/sos
 * @desc    Trigger SOS for an active ride
 * @access  Protected
 */
export const triggerSOS = asyncHandler(async (req: Request, res: Response) => {
  const ride = await Ride.findById(req.params.id);
  if (!ride) throw new ApiError(404, 'Ride not found');

  const triggeredBy = ride.passenger.toString() === req.user?._id ? 'Passenger' : 'Rider';

  // Mark ride with SOS alert (push to aiSafetyAlerts or similar, or just status)
  ride.aiSafetyAlerts.push({
    type: 'sos_triggered',
    timestamp: new Date(),
    resolved: false
  });
  await ride.save();

  // Socket notification to admin
  import('../sockets/tracking.socket').then(({ ioInstance }) => {
    if (ioInstance) {
      ioInstance.to('admin_room').emit('admin_sos_alert', {
        rideId: ride._id,
        triggeredBy,
        userId: req.user?._id,
        timestamp: new Date(),
      });
    }
  });

  // You can also add FCM to admin or SMS/WhatsApp to emergency contacts here
  
  res.status(200).json(new ApiResponse(200, 'SOS Triggered Successfully', ride));
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
 * @route   GET /api/v1/ride/:id
 * @desc    Get a single ride's details
 * @access  Protected
 */
export const getRideDetails = asyncHandler(async (req: Request, res: Response) => {
  const ride = await Ride.findById(req.params.id)
    .populate('passenger', 'name phoneNumber')
    .populate('rider', 'name phoneNumber');
  if (!ride) throw new ApiError(404, 'Ride not found');
  res.status(200).json(new ApiResponse(200, 'Ride details fetched', ride));
});

/**
 * @route   GET /api/v1/ride/history
 * @desc    Get user's ride history (paginated)
 * @access  Protected
 */
export const getRideHistory = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  const query = { $or: [{ rider: req.user?._id }, { passenger: req.user?._id }] };

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
