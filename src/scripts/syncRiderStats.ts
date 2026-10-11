import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { User } from '../models/User';
import { RiderProfile } from '../models/RiderProfile';
import { Ride } from '../models/Ride';
import { RideStatus } from '../config/constants';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const syncRiderStats = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/woosh';
    console.log('[Sync] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('[Sync] Connected successfully. Models ready:', User.modelName);

    const profiles = await RiderProfile.find().populate('user', 'name phoneNumber');
    console.log(`[Sync] Found ${profiles.length} rider profile(s) to inspect.`);

    // 1. Ensure all completed rides have platformCommission and riderEarnings computed
    const completedRides = await Ride.find({ 
      status: { $in: [RideStatus.COMPLETED, RideStatus.PAYMENT_COMPLETED] } 
    });
    console.log(`[Sync] Found ${completedRides.length} completed rides to verify.`);

    for (const ride of completedRides) {
      const fare = ride.finalFare || ride.estimatedFare || 0;
      let changed = false;

      if (ride.platformCommission === undefined || ride.platformCommission === null) {
        ride.platformCommission = Number((fare * 0.2).toFixed(2));
        changed = true;
      }
      if (ride.riderEarnings === undefined || ride.riderEarnings === null) {
        ride.riderEarnings = Number((fare - ride.platformCommission).toFixed(2));
        changed = true;
      }
      if (!ride.finalFare && fare > 0) {
        ride.finalFare = fare;
        changed = true;
      }

      if (changed) {
        await ride.save();
        console.log(`  [Ride Updated] ${ride._id}: fare=${ride.finalFare}, commission=${ride.platformCommission}, riderEarnings=${ride.riderEarnings}`);
      }
    }

    // 2. Check and credit any missing Online/UPI rides to rider's wallet
    const { WalletTransaction } = await import('../models/WalletTransaction');
    const { WalletTransactionType } = await import('../config/constants');

    for (const profile of profiles) {
      const riderUserId = profile.user?._id || profile.user;
      if (!riderUserId) continue;

      const userName = (profile.user as any)?.name || (profile.user as any)?.phoneNumber || riderUserId;

      // Online rides that should have been credited to wallet
      const onlineRides = await Ride.find({
        rider: riderUserId,
        status: { $in: [RideStatus.COMPLETED, RideStatus.PAYMENT_COMPLETED] },
        paymentMethod: { $ne: 'cash' }
      } as any);

      for (const oRide of onlineRides) {
        const existingTxn = await WalletTransaction.findOne({
          user: riderUserId,
          referenceId: oRide._id.toString(),
          type: { $in: [WalletTransactionType.CREDIT, 'topup'] }
        } as any);

        if (!existingTxn) {
          const creditAmount = oRide.riderEarnings || (oRide.finalFare ? Number((oRide.finalFare * 0.8).toFixed(2)) : 0);
          if (creditAmount > 0) {
            profile.walletBalance += creditAmount;
            await WalletTransaction.create({
              user: riderUserId,
              type: WalletTransactionType.CREDIT,
              amount: creditAmount,
              description: `Earnings for Ride: ${oRide._id}`,
              balanceAfter: profile.walletBalance,
              referenceId: oRide._id.toString(),
              category: 'ride_earnings',
            });
            console.log(`  >>> [Credited Online Ride to Wallet] Rider: ${userName}, Ride: ${oRide._id}, Amount: ₹${creditAmount}, New Balance: ₹${profile.walletBalance}`);
          }
        }
      }

      // Recalculate lifetime earnings
      const lifetimeResult = await Ride.aggregate([
        { 
          $match: { 
            rider: riderUserId, 
            status: { $in: [RideStatus.COMPLETED, RideStatus.PAYMENT_COMPLETED] } 
          } 
        },
        { 
          $group: { 
            _id: null, 
            totalEarnings: { $sum: "$riderEarnings" }, 
            totalRides: { $sum: 1 } 
          } 
        }
      ]);

      const calculatedEarnings = Number((lifetimeResult[0]?.totalEarnings || 0).toFixed(2));
      const calculatedRides = lifetimeResult[0]?.totalRides || 0;

      profile.totalEarnings = Math.max(profile.totalEarnings || 0, calculatedEarnings);
      profile.totalRides = Math.max(profile.totalRides || 0, calculatedRides);
      await RiderProfile.updateOne(
        { _id: profile._id },
        { 
          $set: { 
            walletBalance: profile.walletBalance,
            totalEarnings: profile.totalEarnings,
            totalRides: profile.totalRides
          } 
        }
      );

      console.log(`[Summary] Rider: ${userName} -> Wallet: ₹${profile.walletBalance}, Total Earnings: ₹${profile.totalEarnings}, Total Rides: ${profile.totalRides}`);
    }

    console.log('\n[Sync] All rider profiles synchronized.');
    process.exit(0);
  } catch (err) {
    console.error('[Sync] Error syncing rider stats:', err);
    process.exit(1);
  }
};

syncRiderStats();
