import { Request, Response } from 'express';
import { SystemConfig } from '../models/SystemConfig';

export const getSettings = async (req: Request, res: Response) => {
  try {
    let settings = await SystemConfig.findOne();
    if (!settings) {
      settings = await SystemConfig.create({});
    }
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    let settings = await SystemConfig.findOne();
    
    // Add updatedBy tracking
    const updateData = {
      ...req.body,
      updatedBy: (req as any).user?._id
    };

    if (!settings) {
      settings = await SystemConfig.create(updateData);
    } else {
      settings = await SystemConfig.findByIdAndUpdate(settings._id, updateData, {
        new: true,
        runValidators: true,
      });
    }

    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};
