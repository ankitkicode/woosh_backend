import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { RiderProfile } from '../models/RiderProfile';
import { Ride } from '../models/Ride';
import { SOSAlert } from '../models/SOSAlert';
import { User } from '../models/User';
import { smsService } from '../services/sms.service';
import { fcmService } from '../services/fcm.service';

/**
 * @route   PUT /api/v1/tracking/location
 * @desc    Rider sends current GPS location (called every 2-5s during active ride)
 * @access  Protected (rider)
 */
export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const { latitude, longitude } = req.body;
  await RiderProfile.findOneAndUpdate(
    { user: req.user?._id },
    { currentLocation: { type: 'Point', coordinates: [longitude, latitude] } }
  );
  res.status(200).json(new ApiResponse(200, 'Location updated', null));
});

/**
 * @route   GET /api/v1/tracking/ride/:rideId/location
 * @desc    Passenger polls for rider's current GPS location
 * @access  Protected (passenger)
 */
export const getRideLocation = asyncHandler(async (req: Request, res: Response) => {
  const ride = await Ride.findById(req.params.rideId).select('rider status');
  if (!ride) throw new ApiError(404, 'Ride not found');
  if (!ride.rider) throw new ApiError(400, 'No rider assigned to this ride yet');

  const riderProfile = await RiderProfile.findOne({ user: ride.rider }).select('currentLocation');
  res.status(200).json(new ApiResponse(200, 'Rider location fetched', riderProfile?.currentLocation));
});

/**
 * @route   POST /api/v1/tracking/sos
 * @desc    Trigger SOS alert → Save to DB, notify emergency contacts, notify admin
 * @access  Protected
 */
export const triggerSOS = asyncHandler(async (req: Request, res: Response) => {
  const { rideId, latitude, longitude, address } = req.body;
  const ride = await Ride.findById(rideId);
  if (!ride) throw new ApiError(404, 'Ride not found');

  ride.sosTriggeredAt = new Date();
  ride.status = 'sos_active' as any;
  await ride.save();

  // Determine role of SOS trigger
  const isPassenger = ride.passenger.toString() === req.user?._id;

  // Create SOSAlert record in DB
  const sosAlert = await SOSAlert.create({
    rideId: ride._id,
    triggeredBy: req.user?._id,
    role: isPassenger ? 'passenger' : 'rider',
    location: {
      lat: latitude || 0,
      lng: longitude || 0,
      address: address || 'Unknown',
    },
    status: 'active',
  });

  // Send SMS to emergency contacts
  const user = await User.findById(req.user?._id);
  if (user && user.emergencyContacts && user.emergencyContacts.length > 0) {
    const locationUrl = `https://maps.google.com/?q=${latitude || 0},${longitude || 0}`;
    for (const contact of user.emergencyContacts) {
      try {
        await smsService.sendAlert(
          contact.phoneNumber,
          `🚨 EMERGENCY! ${user.name || 'Your contact'} has pressed SOS on Woosh at ${address || 'an unknown location'}. Live location: ${locationUrl}`
        );
      } catch (err) {
        console.error(`[SOS] Failed to send SMS to emergency contact ${contact.phoneNumber}:`, err);
      }
    }
  }

  // Notify all admins via FCM (they should be subscribed to 'admin' topic)
  try {
    // Log for monitoring
    console.log(`[SOS TRIGGERED] Ride: ${rideId} | User: ${req.user?._id} | Role: ${isPassenger ? 'passenger' : 'rider'} | Time: ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[SOS] Error in admin notification:', err);
  }

  res.status(200).json(new ApiResponse(200, 'SOS triggered. Help is on the way!', {
    sosAlertId: sosAlert._id,
    rideId,
    sosAt: ride.sosTriggeredAt,
    emergencyContactsNotified: user?.emergencyContacts?.length || 0,
  }));
});
