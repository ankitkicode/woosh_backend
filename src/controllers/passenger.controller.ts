import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { ChildProfile } from '../models/ChildProfile';
import { Dispute } from '../models/Dispute';
import { MAX_CHILDREN_PER_ACCOUNT } from '../config/constants';

/**
 * @route   GET /api/v1/passenger/profile
 * @desc    Get current passenger's profile
 * @access  Protected (passenger)
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user?._id).select('-refreshToken');
  if (!user) throw new ApiError(404, 'Passenger not found');
  res.status(200).json(new ApiResponse(200, 'Profile fetched', user));
});

/**
 * @route   PUT /api/v1/passenger/profile
 * @desc    Update passenger's own profile
 * @access  Protected (passenger)
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, gender, emergencyContacts } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    { name, email, gender, emergencyContacts },
    { new: true, runValidators: true }
  ).select('-refreshToken');
  res.status(200).json(new ApiResponse(200, 'Profile updated', user));
});

/**
 * @route   POST /api/v1/passenger/children
 * @desc    Add a child profile for the passenger
 * @access  Protected (passenger)
 */
export const addChildProfile = asyncHandler(async (req: Request, res: Response) => {
  const count = await ChildProfile.countDocuments({ passenger: req.user?._id });
  if (count >= MAX_CHILDREN_PER_ACCOUNT) {
    throw new ApiError(400, `Maximum ${MAX_CHILDREN_PER_ACCOUNT} child profiles allowed per account`);
  }
  const child = await ChildProfile.create({ ...req.body, passenger: req.user?._id });
  res.status(201).json(new ApiResponse(201, 'Child profile added', child));
});

/**
 * @route   GET /api/v1/passenger/children
 * @desc    Get all child profiles of the passenger
 * @access  Protected (passenger)
 */
export const getChildProfiles = asyncHandler(async (req: Request, res: Response) => {
  const children = await ChildProfile.find({ passenger: req.user?._id });
  res.status(200).json(new ApiResponse(200, 'Child profiles fetched', children));
});

/**
 * @route   DELETE /api/v1/passenger/children/:id
 * @desc    Delete a child profile
 * @access  Protected (passenger)
 */
export const deleteChildProfile = asyncHandler(async (req: Request, res: Response) => {
  const child = await ChildProfile.findOneAndDelete({ _id: req.params.id, passenger: req.user?._id });
  if (!child) throw new ApiError(404, 'Child profile not found');
  res.status(200).json(new ApiResponse(200, 'Child profile removed', null));
});

/**
 * @route   POST /api/v1/passenger/disputes
 * @desc    Submit a dispute
 * @access  Protected (passenger)
 */
export const submitDispute = asyncHandler(async (req: Request, res: Response) => {
  const dispute = await Dispute.create({
    raisedBy: req.user?._id,
    ride: req.body.rideId,
    category: req.body.category,
    subject: req.body.subject,
    description: req.body.description,
  });
  res.status(201).json(new ApiResponse(201, 'Dispute submitted', dispute));
});
