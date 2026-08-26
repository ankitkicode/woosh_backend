import { Request, Response } from 'express';
import { Gateway } from '../models/Gateway';

export const getGateways = async (req: Request, res: Response) => {
  try {
    const gateways = await Gateway.find().sort({ provider: 1 });
    res.json({ success: true, count: gateways.length, data: gateways });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createGateway = async (req: Request, res: Response) => {
  try {
    const gateway = await Gateway.create(req.body);
    res.status(201).json({ success: true, data: gateway });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Provider and type combination already exists.' });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

export const updateGateway = async (req: Request, res: Response) => {
  try {
    const gateway = await Gateway.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!gateway) {
      return res.status(404).json({ success: false, message: 'Gateway not found' });
    }
    res.json({ success: true, data: gateway });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const toggleGatewayStatus = async (req: Request, res: Response) => {
  try {
    const gateway = await Gateway.findById(req.params.id);
    if (!gateway) {
      return res.status(404).json({ success: false, message: 'Gateway not found' });
    }
    gateway.isActive = !gateway.isActive;
    await gateway.save();
    res.json({ success: true, data: gateway });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};
