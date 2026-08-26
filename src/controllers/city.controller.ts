import { Request, Response } from 'express';
import { City } from '../models/City';

export const getCities = async (req: Request, res: Response) => {
  try {
    const cities = await City.find().sort({ createdAt: -1 });
    res.json({ success: true, count: cities.length, data: cities });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createCity = async (req: Request, res: Response) => {
  try {
    const city = await City.create(req.body);
    res.status(201).json({ success: true, data: city });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'City already exists in this state and country.' });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

export const updateCity = async (req: Request, res: Response) => {
  try {
    const city = await City.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!city) {
      return res.status(404).json({ success: false, message: 'City not found' });
    }
    res.json({ success: true, data: city });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const toggleCityStatus = async (req: Request, res: Response) => {
  try {
    const city = await City.findById(req.params.id);
    if (!city) {
      return res.status(404).json({ success: false, message: 'City not found' });
    }
    city.isActive = !city.isActive;
    await city.save();
    res.json({ success: true, data: city });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};
