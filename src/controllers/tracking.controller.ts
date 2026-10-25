import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { RiderProfile } from '../models/RiderProfile';
import { Ride } from '../models/Ride';
import { SOSAlert } from '../models/SOSAlert';
import { User } from '../models/User';
import { Admin } from '../models/Admin';
import { whatsappService } from '../services/whatsapp.service';
import { UserRole, RideStatus } from '../config/constants';

/**
 * @route   PUT /api/v1/tracking/location
 * @route   POST /api/v1/tracking/location
 * @route   PUT /api/v1/tracking/update-location
 * @route   POST /api/v1/tracking/update-location
 * @desc    Rider sends current GPS location (called periodically during shift/ride)
 * @access  Protected (rider, both)
 */
export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  let latitude = req.body.latitude !== undefined ? req.body.latitude : (req.body.lat !== undefined ? req.body.lat : (req.body.coords?.latitude || (Array.isArray(req.body.coordinates) ? req.body.coordinates[1] : undefined)));
  let longitude = req.body.longitude !== undefined ? req.body.longitude : (req.body.lng !== undefined ? req.body.lng : (req.body.coords?.longitude || (Array.isArray(req.body.coordinates) ? req.body.coordinates[0] : undefined)));
  const heading = req.body.heading !== undefined ? Number(req.body.heading) : 0;
  const speed = req.body.speed !== undefined ? Number(req.body.speed) : 0;

  if (latitude === undefined || longitude === undefined) {
    throw new ApiError(400, 'latitude and longitude coordinates are required');
  }

  const latNum = Number(latitude);
  const lngNum = Number(longitude);

  const updatedProfile = await RiderProfile.findOneAndUpdate(
    { user: req.user?._id },
    {
      currentLocation: {
        type: 'Point',
        coordinates: [lngNum, latNum],
      },
      isOnline: true,
    },
    { new: true }
  );

  // If rider is currently in an ongoing ride, emit socket update
  const activeRide = await Ride.findOne({
    rider: req.user?._id,
    status: { $in: [RideStatus.ACCEPTED, RideStatus.RIDER_EN_ROUTE, RideStatus.RIDER_ARRIVED, RideStatus.STARTED, RideStatus.IN_PROGRESS, RideStatus.SOS_ACTIVE] },
  }).select('_id passenger');

  import('../sockets/tracking.socket').then(({ getIo }) => {
    const io = getIo();
    if (io) {
      const locationPayload = {
        riderId: req.user?._id,
        latitude: latNum,
        longitude: lngNum,
        heading,
        speed,
        timestamp: new Date().toISOString(),
      };

      // Broadcast to passenger home radar
      io.to('passenger:home').emit('location:update', locationPayload);

      // If in active ride, broadcast to ride room
      if (activeRide) {
        io.to(`ride:${activeRide._id}`).emit('location:update', {
          rideId: activeRide._id,
          ...locationPayload,
        });
        io.to(`ride_${activeRide._id}`).emit('rider_location_update', {
          rideId: activeRide._id,
          location: { latitude: latNum, longitude: lngNum },
          heading,
          speed,
          timestamp: new Date(),
        });
      }

      // Broadcast to Admin live fleet radar
      io.to('admin:room').emit('fleet:location_update', {
        riderId: updatedProfile?._id,
        userId: req.user?._id,
        rideId: activeRide?._id || null,
        latitude: latNum,
        longitude: lngNum,
        heading,
        speed,
        timestamp: new Date().toISOString(),
      });
      io.to('admin_room').emit('fleet:location_update', {
        riderId: updatedProfile?._id,
        userId: req.user?._id,
        rideId: activeRide?._id || null,
        latitude: latNum,
        longitude: lngNum,
        heading,
        speed,
        timestamp: new Date().toISOString(),
      });
    }
  }).catch(() => {});

  res.status(200).json(new ApiResponse(200, 'Location updated successfully', {
    coordinates: [lngNum, latNum],
    latitude: latNum,
    longitude: lngNum,
    heading,
    speed,
    isOnline: updatedProfile?.isOnline ?? true,
  }));
});

/**
 * @route   GET /api/v1/tracking/ride/:rideId/location
 * @desc    Get live GPS location & trip details for a specific ride (Passenger, Rider, or Admin)
 * @access  Protected (Passenger of ride, Rider of ride, Admin, Super Admin)
 */
export const getRideLocation = asyncHandler(async (req: Request, res: Response) => {
  const ride = await Ride.findById(req.params.rideId)
    .populate('passenger', 'name phoneNumber')
    .populate('rider', 'name phoneNumber')
    .select('rider passenger status pickup drop finalFare estimatedFare sosTriggeredAt otp createdAt');

  if (!ride) throw new ApiError(404, 'Ride not found');

  let riderLocation = null;
  let vehicleInfo = null;

  if (ride.rider) {
    const riderId = typeof ride.rider === 'object' ? (ride.rider as any)._id : ride.rider;
    const riderProfile = await RiderProfile.findOne({ user: riderId })
      .select('currentLocation vehicleNumber vehicleModel vehicleColor vehicleType isOnline');

    if (riderProfile) {
      riderLocation = riderProfile.currentLocation;
      vehicleInfo = {
        vehicleNumber: riderProfile.vehicleNumber,
        vehicleModel: riderProfile.vehicleModel,
        vehicleColor: riderProfile.vehicleColor,
        vehicleType: riderProfile.vehicleType || 'scooter',
        isOnline: riderProfile.isOnline,
      };
    }
  }

  const coordinates = riderLocation?.coordinates || null;

  res.status(200).json(
    new ApiResponse(200, 'Live ride tracking data fetched', {
      rideId: ride._id,
      status: ride.status,
      pickup: ride.pickup,
      drop: ride.drop,
      passenger: ride.passenger,
      rider: ride.rider,
      vehicle: vehicleInfo,
      riderLocation,
      currentLocation: riderLocation,
      coordinates,
      latitude: coordinates ? coordinates[1] : null,
      longitude: coordinates ? coordinates[0] : null,
      sosTriggeredAt: ride.sosTriggeredAt,
      otp: ride.otp,
      estimatedFare: ride.estimatedFare,
      finalFare: ride.finalFare,
    })
  );
});

/**
 * @route   GET /api/v1/tracking/admin/fleet
 * @desc    Admin & Super Admin live fleet tracking (All online/active riders on the map)
 * @access  Protected (Admin, Super Admin)
 */
export const getFleetLiveTracking = asyncHandler(async (req: Request, res: Response) => {
  const { city } = req.query;

  const filter: any = { isOnline: true };

  const onlineRiders = await RiderProfile.find(filter)
    .populate('user', 'name phoneNumber city isActive')
    .select('user vehicleNumber vehicleModel vehicleColor vehicleType currentLocation isOnline totalRides acceptedRides')
    .limit(100);

  // Match each rider with their active ride if in transit
  const riderUserIds = onlineRiders.map(r => r.user?._id).filter(Boolean);

  const activeRides = await Ride.find({
    rider: { $in: riderUserIds },
    status: { $in: [RideStatus.ACCEPTED, RideStatus.RIDER_ARRIVED, RideStatus.STARTED, RideStatus.IN_PROGRESS, RideStatus.SOS_ACTIVE] },
  }).select('_id rider passenger status pickup drop');

  const activeRidesMap = new Map();
  activeRides.forEach(ride => {
    if (ride.rider) {
      activeRidesMap.set(ride.rider.toString(), {
        rideId: ride._id,
        status: ride.status,
        pickup: ride.pickup?.address,
        drop: ride.drop?.address,
      });
    }
  });

  const fleet = onlineRiders.map(rider => {
    const userIdStr = rider.user?._id?.toString() || '';
    const currentTrip = activeRidesMap.get(userIdStr) || null;

    return {
      riderId: rider._id,
      userId: rider.user?._id,
      name: (rider.user as any)?.name || 'Rider',
      phoneNumber: (rider.user as any)?.phoneNumber || '',
      city: (rider.user as any)?.city || 'Bhopal',
      vehicleNumber: rider.vehicleNumber,
      vehicleModel: rider.vehicleModel,
      vehicleType: rider.vehicleType || 'scooter',
      currentLocation: rider.currentLocation,
      isOnline: rider.isOnline,
      onTrip: Boolean(currentTrip),
      currentTrip,
    };
  });

  res.status(200).json(
    new ApiResponse(200, `Active fleet tracked: ${fleet.length} riders online`, {
      totalOnline: fleet.length,
      onTripCount: fleet.filter(f => f.onTrip).length,
      idleCount: fleet.filter(f => !f.onTrip).length,
      fleet,
    })
  );
});

/**
 * @route   GET /api/v1/tracking/admin/live-rides
 * @desc    Admin & Super Admin view all live active rides in transit
 * @access  Protected (Admin, Super Admin)
 */
export const getLiveRidesTracking = asyncHandler(async (req: Request, res: Response) => {
  const activeRides = await Ride.find({
    status: {
      $in: [
        RideStatus.ACCEPTED,
        RideStatus.RIDER_EN_ROUTE,
        RideStatus.RIDER_ARRIVED,
        RideStatus.STARTED,
        RideStatus.IN_PROGRESS,
        RideStatus.SOS_ACTIVE,
      ],
    },
  })
    .populate('passenger', 'name phoneNumber')
    .populate('rider', 'name phoneNumber')
    .sort({ createdAt: -1 });

  // Enrich with live rider coordinates
  const riderIds = activeRides.map(r => r.rider?._id).filter(Boolean);
  const profiles = await RiderProfile.find({ user: { $in: riderIds } } as any).select('user currentLocation vehicleNumber vehicleModel');
  const profileMap = new Map();
  profiles.forEach(p => profileMap.set(p.user.toString(), p));

  const enrichedRides = activeRides.map(ride => {
    const riderIdStr = ride.rider?._id?.toString() || '';
    const profile = profileMap.get(riderIdStr);

    return {
      _id: ride._id,
      status: ride.status,
      passenger: ride.passenger,
      rider: ride.rider,
      vehicleNumber: profile?.vehicleNumber,
      vehicleModel: profile?.vehicleModel,
      riderCurrentLocation: profile?.currentLocation,
      pickup: ride.pickup,
      drop: ride.drop,
      fare: ride.finalFare || ride.estimatedFare,
      sosActive: ride.status === RideStatus.SOS_ACTIVE,
      createdAt: ride.createdAt,
    };
  });

  res.status(200).json(
    new ApiResponse(200, `${enrichedRides.length} live rides in transit`, {
      total: enrichedRides.length,
      rides: enrichedRides,
    })
  );
});

/**
 * @route   GET /api/v1/tracking/rider/:riderId
 * @desc    Get current location of a specific rider by RiderProfile ID or User ID
 * @access  Protected (Admin, Super Admin)
 */
export const getRiderLocationById = asyncHandler(async (req: Request, res: Response) => {
  const { riderId } = req.params;

  const profile = await RiderProfile.findOne({
    $or: [{ _id: riderId }, { user: riderId }],
  })
    .populate('user', 'name phoneNumber email isActive')
    .select('user vehicleNumber vehicleModel currentLocation isOnline totalRides');

  if (!profile) throw new ApiError(404, 'Rider profile not found');

  res.status(200).json(
    new ApiResponse(200, 'Rider live location fetched', {
      rider: profile,
      currentLocation: profile.currentLocation,
      isOnline: profile.isOnline,
    })
  );
});

/**
 * @route   POST /api/v1/tracking/sos
 * @desc    Trigger SOS alert → Save to DB, notify emergency contacts, notify all admins
 * @access  Protected
 */
export const triggerSOS = asyncHandler(async (req: Request, res: Response) => {
  const { rideId, address } = req.body;
  let latitude = req.body.latitude !== undefined ? req.body.latitude : req.body.lat;
  let longitude = req.body.longitude !== undefined ? req.body.longitude : req.body.lng;

  // 1. Locate ride if rideId provided, or find active ride for user
  let ride = null;
  if (rideId) {
    ride = await Ride.findById(rideId);
  } else if (req.user?._id) {
    ride = await Ride.findOne({
      $or: [{ rider: req.user._id }, { passenger: req.user._id }],
      status: {
        $in: [
          RideStatus.ACCEPTED,
          RideStatus.RIDER_EN_ROUTE,
          RideStatus.RIDER_ARRIVED,
          RideStatus.STARTED,
          RideStatus.IN_PROGRESS,
        ],
      },
    }).sort({ createdAt: -1 });
  }

  // 2. Fallback coordinates from RiderProfile if missing
  if ((latitude === undefined || longitude === undefined) && req.user?._id) {
    const profile = await RiderProfile.findOne({ user: req.user._id }).select('currentLocation');
    if (profile?.currentLocation?.coordinates) {
      longitude = profile.currentLocation.coordinates[0];
      latitude = profile.currentLocation.coordinates[1];
    }
  }

  const latNum = Number(latitude) || 0;
  const lngNum = Number(longitude) || 0;

  // 3. If ride found, mark SOS status on ride
  let roleStr: 'passenger' | 'rider' = 'passenger';
  if (ride) {
    ride.sosTriggeredAt = new Date();
    ride.status = RideStatus.SOS_ACTIVE as any;
    if (!ride.aiSafetyAlerts) ride.aiSafetyAlerts = [];
    ride.aiSafetyAlerts.push({
      type: 'sos_triggered',
      timestamp: new Date(),
      resolved: false,
    });
    await ride.save();

    const isPassenger = ride.passenger?.toString() === req.user?._id?.toString();
    roleStr = isPassenger ? 'passenger' : 'rider';
  } else {
    // If no active ride, deduce role from user profile
    const isRider = req.user?.role === 'rider' || req.user?.role === 'both';
    roleStr = isRider ? 'rider' : 'passenger';
  }

  // 4. Create SOSAlert record in DB
  const sosAlert = await SOSAlert.create({
    rideId: ride?._id || undefined,
    triggeredBy: req.user?._id,
    role: roleStr,
    location: {
      lat: latNum,
      lng: lngNum,
      address: address || (latNum && lngNum ? `Lat: ${latNum.toFixed(4)}, Lng: ${lngNum.toFixed(4)}` : 'Live coordinates active'),
    },
    status: 'active',
  });

  // 5. Send WhatsApp SOS Alert to emergency contacts & Admin
  const user = await User.findById(req.user?._id);
  const locationUrl = latNum && lngNum ? `https://maps.google.com/?q=${latNum},${lngNum}` : 'Location unknown';
  const resolvedAddress = address || (latNum && lngNum ? `Lat: ${latNum.toFixed(4)}, Lng: ${lngNum.toFixed(4)}` : 'Live coordinates active');
  const rideLabel = ride ? `#${ride._id.toString().slice(-8).toUpperCase()}` : 'N/A';
  const alertUserName = user?.name || user?.phoneNumber || 'User';

  // Send to user's emergency contacts if available
  if (user && user.emergencyContacts && user.emergencyContacts.length > 0) {
    for (const contact of user.emergencyContacts) {
      try {
        await whatsappService.sendSOSAlert(
          contact.phoneNumber,
          alertUserName,
          resolvedAddress,
          locationUrl,
          rideLabel
        );
      } catch (err) {
        console.error(`[SOS] Failed to send WhatsApp to emergency contact ${contact.phoneNumber}:`, err);
      }
    }
  }

  // Also send WhatsApp SOS Alert to Admin (9011013612)
  const adminSOSPhone = process.env.ADMIN_SOS_PHONE || '9011013612';
  try {
    await whatsappService.sendSOSAlert(
      adminSOSPhone,
      alertUserName,
      resolvedAddress,
      locationUrl,
      rideLabel
    );
  } catch (err) {
    console.error(`[SOS] Failed to send WhatsApp to Admin (${adminSOSPhone}):`, err);
  }

  // 6. Notify admin via Socket (Both admin:room and admin_room, both events)
  import('../sockets/tracking.socket').then(({ getIo }) => {
    const ioInstance = getIo();
    if (ioInstance) {
      const sosSocketPayload = {
        sosAlertId: sosAlert._id,
        rideId: ride?._id || null,
        triggeredBy: roleStr,
        userId: req.user?._id,
        userName: user?.name || 'User',
        userPhone: user?.phoneNumber || '',
        location: { latitude: latNum, longitude: lngNum, address: address || 'Live coordinates active' },
        timestamp: new Date().toISOString(),
      };

      ioInstance.to('admin:room').emit('sos:alert', sosSocketPayload);
      ioInstance.to('admin:room').emit('admin_sos_alert', sosSocketPayload);
      ioInstance.to('admin_room').emit('sos:alert', sosSocketPayload);
      ioInstance.to('admin_room').emit('admin_sos_alert', sosSocketPayload);
    }
  }).catch(err => console.error('[SOS] Socket error:', err));

  // 7. Notify Admins & Super Admins via FCM Push Notification
  Promise.all([
    User.find({ role: { $in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] } }).select('_id'),
    Admin.find({ isActive: true }).select('_id'),
  ]).then(([userAdmins, systemAdmins]) => {
    const adminIds = [
      ...userAdmins.map(a => a._id.toString()),
      ...systemAdmins.map(a => a._id.toString()),
    ];

    if (adminIds.length > 0) {
      import('../services/fcm.service').then(({ fcmService }) => {
        const title = '🚨 EMERGENCY SOS ALERT!';
        const body = ride
          ? `SOS triggered by ${roleStr.toUpperCase()} on Ride #${ride._id}. ${address || ''}`
          : `SOS triggered by ${roleStr.toUpperCase()} (${user?.name || user?.phoneNumber || 'User'}). Location: ${latNum}, ${lngNum}`;

        fcmService.sendToUsers(
          adminIds,
          title,
          body,
          {
            type: 'SOS_TRIGGERED',
            sosAlertId: sosAlert._id.toString(),
            rideId: ride ? ride._id.toString() : '',
            role: roleStr,
          }
        ).catch(err => console.error('[FCM] Error sending SOS push to admins:', err));
      });
    }
  }).catch(err => console.error('[SOS] Error finding admins for push:', err));

  res.status(200).json(new ApiResponse(200, 'SOS triggered. Emergency response activated!', {
    sosAlertId: sosAlert._id,
    rideId: ride?._id || null,
    sosAt: ride?.sosTriggeredAt || new Date(),
    emergencyContactsNotified: user?.emergencyContacts?.length || 0,
    role: roleStr,
  }));
});
