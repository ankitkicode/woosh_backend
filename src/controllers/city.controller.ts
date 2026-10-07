import { Request, Response } from 'express';
import { City } from '../models/City';
import { PricingRule } from '../models/PricingRule';

export const getCities = async (req: Request, res: Response) => {
  try {
    const cities = await City.find().sort({ createdAt: -1 });
    res.json({ success: true, count: cities.length, data: cities });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCityById = async (req: Request, res: Response) => {
  try {
    const city = await City.findById(req.params.id);
    if (!city) {
      return res.status(404).json({ success: false, message: 'City not found' });
    }
    res.json({ success: true, data: city });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createCity = async (req: Request, res: Response) => {
  try {
    const { name, state, country, baseFare, perKmRate, perMinuteRate, minFare, isSurgeActive, surgeMultiplier, pincodes, areas } = req.body;
    
    const city = await City.create({
      name,
      state,
      country: country || 'India',
      baseFare,
      perKmRate,
      perMinuteRate,
      minFare: minFare || 50,
      isSurgeActive: isSurgeActive || false,
      surgeMultiplier: surgeMultiplier || 1,
      pincodes: pincodes || [],
      areas: areas || [],
    });

    await PricingRule.create({
      city: name.toLowerCase(),
      baseFare,
      costPerKm: perKmRate,
      costPerMinute: perMinuteRate,
      minFare: minFare || 50,
      isSurgeActive: isSurgeActive || false,
      surgeMultiplier: surgeMultiplier || 1,
    });

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
    const city = await City.findById(req.params.id);
    if (!city) {
      return res.status(404).json({ success: false, message: 'City not found' });
    }

    const allowedFields = ['name', 'state', 'country', 'baseFare', 'perKmRate', 'perMinuteRate', 'minFare', 'isSurgeActive', 'surgeMultiplier', 'pincodes', 'areas', 'isActive'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        (city as any)[field] = req.body[field];
      }
    }

    await city.save();

    // Also update PricingRule to keep them in sync
    await PricingRule.findOneAndUpdate(
      { city: city.name.toLowerCase() },
      {
        baseFare: city.baseFare,
        costPerKm: city.perKmRate,
        costPerMinute: city.perMinuteRate,
        minFare: city.minFare,
        isSurgeActive: city.isSurgeActive,
        surgeMultiplier: city.surgeMultiplier
      },
      { upsert: true } // In case the rule didn't exist
    );

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

export const deleteCity = async (req: Request, res: Response) => {
  try {
    const city = await City.findByIdAndDelete(req.params.id);
    if (!city) {
      return res.status(404).json({ success: false, message: 'City not found' });
    }
    res.json({ success: true, message: `City "${city.name}" deleted successfully` });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
