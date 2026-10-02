import { Ride } from '../models/Ride';

export const getChartData = async () => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const rides = await Ride.find({
    createdAt: { $gte: sevenDaysAgo, $lte: today }
  });

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const revenueMap = new Map<string, number>();
  const volumeMap = new Map<string, number>();

  // Initialize all 7 days
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    const dayName = days[d.getDay()];
    revenueMap.set(dayName, 0);
    volumeMap.set(dayName, 0);
  }

  rides.forEach(ride => {
    const dayName = days[ride.createdAt.getDay()];
    
    // Volume
    volumeMap.set(dayName, (volumeMap.get(dayName) || 0) + 1);
    
    // Revenue
    if (['completed', 'payment_completed'].includes(ride.status)) {
      const fare = ride.finalFare || ride.estimatedFare || 0;
      revenueMap.set(dayName, (revenueMap.get(dayName) || 0) + fare);
    }
  });

  const revenueData = [];
  const rideVolumeData = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    const dayName = days[d.getDay()];
    
    revenueData.push({
      name: dayName,
      revenue: revenueMap.get(dayName) || 0
    });
    
    rideVolumeData.push({
      name: dayName,
      rides: volumeMap.get(dayName) || 0
    });
  }

  return { revenueData, rideVolumeData };
};

import { User } from '../models/User';

export const getTrendsData = async () => {
  const today = new Date();
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);
  
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(today.getDate() - 14);

  // Active Rides (all rides created in last 7 days vs previous 7 days)
  const currentRides = await Ride.countDocuments({ createdAt: { $gte: sevenDaysAgo, $lte: today } });
  const previousRides = await Ride.countDocuments({ createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } });

  // Riders
  const currentRiders = await User.countDocuments({ role: 'rider', createdAt: { $gte: sevenDaysAgo, $lte: today } } as Record<string, unknown>);
  const previousRiders = await User.countDocuments({ role: 'rider', createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } } as Record<string, unknown>);

  // Passengers
  const currentPassengers = await User.countDocuments({ role: 'passenger', createdAt: { $gte: sevenDaysAgo, $lte: today } } as Record<string, unknown>);
  const previousPassengers = await User.countDocuments({ role: 'passenger', createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } } as Record<string, unknown>);

  // Revenue (completed rides in last 7 days vs previous 7 days)
  const currentRevAggr = await Ride.aggregate([
    { $match: { status: { $in: ['completed', 'payment_completed'] }, createdAt: { $gte: sevenDaysAgo, $lte: today } } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$finalFare', '$estimatedFare'] } } } }
  ]);
  const previousRevAggr = await Ride.aggregate([
    { $match: { status: { $in: ['completed', 'payment_completed'] }, createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$finalFare', '$estimatedFare'] } } } }
  ]);

  const currentRevenue = currentRevAggr[0]?.total || 0;
  const previousRevenue = previousRevAggr[0]?.total || 0;

  const calculateTrend = (current: number, prev: number) => {
    if (prev === 0) return current > 0 ? 100 : 0;
    return Number((((current - prev) / prev) * 100).toFixed(1));
  };

  return {
    revenue: calculateTrend(currentRevenue, previousRevenue),
    activeRides: calculateTrend(currentRides, previousRides),
    totalRiders: calculateTrend(currentRiders, previousRiders),
    totalPassengers: calculateTrend(currentPassengers, previousPassengers)
  };
};
