import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { Contact } from '../models/Contact.model';
import { whatsappService } from '../services/whatsapp.service';

export const createContact = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, queryType, message } = req.body;

  const contact = await Contact.create({
    name,
    phone,
    queryType,
    message,
  });

  // Send WhatsApp confirmation
  // await whatsappService.sendSupportConfirmation(phone, name, queryType);

  res.status(201).json({
    success: true,
    message: 'Contact request submitted successfully',
    data: contact,
  });
});
