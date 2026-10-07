import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { RiderSupport } from '../models/RiderSupport.model';
import { whatsappService } from '../services/whatsapp.service';

export const createRiderSupport = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, queryType, message } = req.body;

  const support = await RiderSupport.create({
    name,
    phone,
    queryType,
    message,
  });

  // Send WhatsApp confirmation
  // await whatsappService.sendSupportConfirmation(phone, name, queryType);

  res.status(201).json({
    success: true,
    message: 'Support request submitted successfully',
    data: support,
  });
});

export const getAllRiderSupports = asyncHandler(async (req: Request, res: Response) => {
  const supports = await RiderSupport.find().sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: supports });
});

export const updateRiderSupportStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const support = await RiderSupport.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  );

  res.status(200).json({ success: true, data: support });
});
