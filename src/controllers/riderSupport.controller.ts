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
