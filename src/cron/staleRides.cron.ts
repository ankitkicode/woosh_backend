import { Ride } from '../models/Ride';
import { RideStatus, CancellationBy } from '../config/constants';

/**
 * Periodically checks for active rides that have been stuck for too long (e.g., > 3 hours)
 * and automatically cancels/timeouts them.
 */
export const startStaleRidesCron = () => {
  // Run every 5 minutes
  setInterval(async () => {
    try {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

      // Active status list that shouldn't persist indefinitely
      const activeStatuses = [
        RideStatus.REQUESTED,
        RideStatus.RIDER_SEARCH,
        RideStatus.RIDER_ASSIGNED,
        RideStatus.ACCEPTED,
        RideStatus.RIDER_EN_ROUTE,
        RideStatus.RIDER_ARRIVED,
        RideStatus.OTP_VERIFICATION,
        RideStatus.STARTED,
        RideStatus.IN_PROGRESS
      ];

      // Find rides stuck in active states for over 3 hours
      const staleRides = await Ride.find({
        status: { $in: activeStatuses },
        updatedAt: { $lt: threeHoursAgo },
      });

      if (staleRides.length > 0) {
        console.log(`[Stale Rides Cron] Found ${staleRides.length} stuck rides. Auto-cancelling...`);

        for (const ride of staleRides) {
          ride.status = RideStatus.TIMED_OUT;
          ride.cancellation = {
            cancelledBy: CancellationBy.SYSTEM,
            reason: 'Automatically closed due to inactivity timeout (3 hours).',
            cancelledAt: new Date()
          };
          await ride.save();
          console.log(`[Stale Rides Cron] Ride ${ride._id} marked as TIMED_OUT.`);
          
          // Optionally emit a socket event here if needed
        }
      }
    } catch (error) {
      console.error('[Stale Rides Cron] Error processing stale rides:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
};
