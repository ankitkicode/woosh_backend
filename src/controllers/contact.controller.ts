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

export const getAllContacts = asyncHandler(async (req: Request, res: Response) => {
  const contacts = await Contact.find().sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: contacts });
});

export const updateContactStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const contact = await Contact.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  );

  res.status(200).json({ success: true, data: contact });
});
