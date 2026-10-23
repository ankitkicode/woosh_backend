import { Ride } from '../models/Ride';
import { PassengerProfile } from '../models/PassengerProfile';
import { SOSAlert } from '../models/SOSAlert';
import { RideStatus, CancellationBy } from '../config/constants';

/**
 * Periodically checks for:
 * 1. Matching / Requested rides stuck without driver acceptance (> 5 minutes) -> TIMED_OUT
 * 2. Active / In-transit rides with prolonged inactivity (> 2 hours) -> TIMED_OUT
 * 3. Orphaned active rides (marked accepted/in-transit but with no rider attached) -> TIMED_OUT
 * 4. Historical SOS rides whose alerts were resolved -> CLOSED
 */
export const cleanupStaleRides = async () => {
  try {
    const now = Date.now();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
    const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);

    // 1. Stale Matching / Requested Rides (stuck searching for drivers for > 5 minutes)
    const staleMatchingRides = await Ride.find({
      status: { $in: [RideStatus.REQUESTED, RideStatus.RIDER_SEARCH, RideStatus.RIDER_ASSIGNED] },
      $or: [
        { updatedAt: { $lt: fiveMinutesAgo } },
        { createdAt: { $lt: fiveMinutesAgo } }
      ]
    });

    if (staleMatchingRides.length > 0) {
      console.log(`[Stale Rides Cron] Found ${staleMatchingRides.length} matching rides past timeout. Auto-cancelling...`);
      for (const ride of staleMatchingRides) {
        ride.status = RideStatus.TIMED_OUT;
        ride.cancellation = {
          cancelledBy: CancellationBy.SYSTEM,
          reason: 'No nearby drivers accepted the request within the matching window. Request timed out.',
          cancelledAt: new Date(),
        };

        // Refund wallet balance if applied
        if (ride.walletAmountUsed && ride.walletAmountUsed > 0) {
          try {
            const profile = await PassengerProfile.findOne({ user: ride.passenger });
            if (profile) {
              profile.walletBalance = Number(((profile.walletBalance || 0) + ride.walletAmountUsed).toFixed(2));
              await profile.save();
            }
          } catch (e) {
            console.error(`[Stale Rides Cron] Wallet refund error for ride ${ride._id}:`, e);
          }
        }

        await ride.save();
        console.log(`[Stale Rides Cron] Matching ride ${ride._id} timed out.`);
      }
    }

    // 2. Active in-transit rides stuck with no activity for over 2 hours or orphaned without driver
    const staleActiveRides = await Ride.find({
      status: {
        $in: [
          RideStatus.ACCEPTED,
          RideStatus.RIDER_EN_ROUTE,
          RideStatus.RIDER_ARRIVED,
          RideStatus.OTP_VERIFICATION,
          RideStatus.STARTED,
          RideStatus.IN_PROGRESS
        ]
      },
      $or: [
        { rider: { $exists: false } },
        { rider: null },
        { updatedAt: { $lt: twoHoursAgo } }
      ]
    });

    if (staleActiveRides.length > 0) {
      console.log(`[Stale Rides Cron] Found ${staleActiveRides.length} inactive in-transit rides. Auto-closing...`);
      for (const ride of staleActiveRides) {
        ride.status = RideStatus.TIMED_OUT;
        ride.cancellation = {
          cancelledBy: CancellationBy.SYSTEM,
          reason: !ride.rider
            ? 'Closed: No driver profile assigned to active transit trip.'
            : 'Automatically closed due to prolonged inactivity timeout (> 2 hours).',
          cancelledAt: new Date(),
        };
        await ride.save();
        console.log(`[Stale Rides Cron] Inactive in-transit ride ${ride._id} timed out.`);
      }
    }

    // 3. Stale SOS active rides where all SOS alerts are already resolved
    const staleSosRides = await Ride.find({
      status: { $in: [RideStatus.SOS_ACTIVE, RideStatus.SAFETY_HOLD] },
      updatedAt: { $lt: thirtyMinutesAgo }
    });

    for (const ride of staleSosRides) {
      const pendingAlerts = await SOSAlert.countDocuments({
        rideId: ride._id,
        status: 'active'
      });

      // If no active emergency alerts remain, archive/close the trip
      if (pendingAlerts === 0) {
        ride.status = RideStatus.CLOSED;
        await ride.save();
        console.log(`[Stale Rides Cron] Resolved SOS ride ${ride._id} marked as CLOSED.`);
      }
    }
  } catch (error) {
    console.error('[Stale Rides Cron] Error processing stale rides:', error);
  }
};

export const startStaleRidesCron = () => {
  // Run immediately on boot to clear out any stale rides right away
  cleanupStaleRides();

  // Run every 1 minute to keep fleet radar and matching list completely clean and real-time
  setInterval(cleanupStaleRides, 60 * 1000);
};
