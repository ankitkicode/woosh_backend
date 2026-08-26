import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { PricingRule } from '../models/PricingRule';
import { User } from '../models/User';
import { Ride } from '../models/Ride';
import { SystemConfig } from '../models/SystemConfig';

/**
 * @route   POST /api/v1/superadmin/cities
 * @desc    Add a new city with default pricing
 * @access  Protected (super_admin)
 */
export const addCity = asyncHandler(async (req: Request, res: Response) => {
  const { city, baseFare, costPerKm, costPerMinute, minFare } = req.body;
  const existing = await PricingRule.findOne({ city: city.toLowerCase() });
  if (existing) throw new ApiError(409, `City "${city}" already exists`);

  const rule = await PricingRule.create({ city, baseFare, costPerKm, costPerMinute, minFare });
  res.status(201).json(new ApiResponse(201, `City "${city}" added with pricing`, rule));
});

/**
 * @route   GET /api/v1/superadmin/cities
 * @desc    Get all cities and their pricing rules
 * @access  Protected (super_admin)
 */
export const getAllCities = asyncHandler(async (req: Request, res: Response) => {
  const cities = await PricingRule.find().sort({ city: 1 });
  res.status(200).json(new ApiResponse(200, 'Cities fetched', cities));
});

/**
 * @route   PUT /api/v1/superadmin/pricing/:city
 * @desc    Update pricing and surge for a city
 * @access  Protected (super_admin)
 */
export const updatePricing = asyncHandler(async (req: Request, res: Response) => {
  const { city } = req.params;
  const rule = await PricingRule.findOneAndUpdate(
    { city: (city as string).toLowerCase() },
    { ...req.body },
    { new: true, runValidators: true }
  );
  if (!rule) throw new ApiError(404, `City "${city}" not found`);
  res.status(200).json(new ApiResponse(200, 'Pricing updated', rule));
});

/**
 * @route   GET /api/v1/superadmin/pricing/:city
 * @desc    Get current pricing rule for a city
 * @access  Protected (super_admin)
 */
export const getPricing = asyncHandler(async (req: Request, res: Response) => {
  const rule = await PricingRule.findOne({ city: (req.params.city as string).toLowerCase() });
  if (!rule) throw new ApiError(404, `No pricing found for city "${req.params.city}"`);
  res.status(200).json(new ApiResponse(200, 'Pricing fetched', rule));
});

/**
 * @route   GET /api/v1/superadmin/stats
 * @desc    Platform-wide business stats
 * @access  Protected (super_admin)
 */
export const getPlatformStats = asyncHandler(async (req: Request, res: Response) => {
  const [totalUsers, totalRides] = await Promise.all([
    User.countDocuments(),
    Ride.countDocuments(),
  ]);
  const revenueResult = await Ride.aggregate([
    { $match: { status: 'completed', finalFare: { $exists: true } } },
    { $group: { _id: null, totalRevenue: { $sum: '$finalFare' } } },
  ]);
  const totalRevenue = revenueResult[0]?.totalRevenue || 0;
  res.status(200).json(new ApiResponse(200, 'Platform stats fetched', { totalUsers, totalRides, totalRevenue }));
});

/**
 * @route   GET /api/v1/superadmin/config
 * @desc    Get system configuration (Theme & Gateways)
 * @access  Protected (super_admin)
 */
export const getSystemConfig = asyncHandler(async (req: Request, res: Response) => {
  let config = await SystemConfig.findOne();
  if (!config) {
    config = await SystemConfig.create({});
  }
  res.status(200).json(new ApiResponse(200, 'System config fetched', config));
});

/**
 * @route   PUT /api/v1/superadmin/config
 * @desc    Update system configuration
 * @access  Protected (super_admin)
 */
export const updateSystemConfig = asyncHandler(async (req: Request, res: Response) => {
  const { gateways, theme } = req.body;
  let config = await SystemConfig.findOne();
  if (!config) {
    config = new SystemConfig();
  }
  
  if (gateways) config.gateways = { ...config.gateways, ...gateways };
  if (theme) config.theme = { ...config.theme, ...theme };
  
  // @ts-ignore - req.user is set by auth middleware
  config.updatedBy = req.user._id;
  await config.save();
  
  res.status(200).json(new ApiResponse(200, 'System config updated', config));
});
