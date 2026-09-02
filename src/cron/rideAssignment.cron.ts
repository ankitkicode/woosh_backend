import { Ride } from '../models/Ride';
import { RiderProfile } from '../models/RiderProfile';
import { fcmService } from '../services/fcm.service';
import { RideStatus, RIDER_SEARCH_RADIUS_KM } from '../config/constants';

/**
 * Periodically checks for rides whose assignment has expired
 * and attempts to assign them to the next nearest rider.
 */
export const startRideAssignmentCron = () => {
  setInterval(async () => {
    try {
      // Find rides that are still requested but assignment has expired
      const expiredRides = await Ride.find({
        status: RideStatus.REQUESTED,
        assignmentExpiresAt: { $lt: new Date() },
      });

      for (const ride of expiredRides) {
        // Find next nearest online rider who hasn't been notified yet
        const nearbyRiders = await RiderProfile.find({
          isOnline: true,
          kycStatus: 'approved',
          'user': { $nin: ride.notifiedRiders }, // Exclude already notified riders
          currentLocation: {
            $near: {
              $geometry: { type: 'Point', coordinates: [ride.pickup.longitude, ride.pickup.latitude] },
              $maxDistance: RIDER_SEARCH_RADIUS_KM * 1000,
            },
          },
        } as unknown as Record<string, unknown>).populate('user', '_id sessions').limit(1);

        if (nearbyRiders.length > 0) {
          const nextRider = nearbyRiders[0];
          const riderUser = nextRider.user as any;

          // Update ride with new assigned rider
          ride.assignedRider = riderUser._id;
          ride.assignmentExpiresAt = new Date(Date.now() + 30000); // Another 30s
          ride.notifiedRiders.push(riderUser._id);
          await ride.save();

          // Notify the new assigned rider
          if (riderUser.sessions) {
            const tokens = riderUser.sessions
              .map((s: any) => s.fcmToken)
              .filter((t: string | undefined): t is string => !!t);
            
            if (tokens.length > 0) {
              await fcmService.sendMulticast(
                tokens,
                '🚗 New Ride Request!',
                `Pickup: ${ride.pickup.address || 'Nearby'} → ${ride.drop.address || 'Destination'} | ₹${ride.estimatedFare}`,
                { rideId: ride._id.toString(), type: 'new_ride_request' }
              );
            }
          }

          // Socket IO fallback
          import('../sockets/tracking.socket').then(({ ioInstance }) => {
            if (ioInstance) {
              ioInstance.to(`rider:${riderUser._id}`).emit('new_ride_request', {
                rideId: ride._id,
                pickup: ride.pickup,
                drop: ride.drop,
                fare: ride.estimatedFare,
                distanceKm: ride.distanceKm,
                passengerId: ride.passenger,
              });
            }
          });

          console.log(`[Ride Assignment] Reassigned ride ${ride._id} to rider ${riderUser._id}`);
        } else {
          // If no more riders found, we could either extend timeout, or leave it for manual acceptance
          // Or we can cancel the ride. For now, just extend expiration so we don't spam.
          ride.assignmentExpiresAt = new Date(Date.now() + 60000); // Check again in 1 min
          await ride.save();
        }
      }
    } catch (error) {
      console.error('[Ride Assignment Cron] Error processing assignments:', error);
    }
  }, 10000); // Run every 10 seconds
};
