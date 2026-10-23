import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  updateLocation,
  getRideLocation,
  triggerSOS,
  getFleetLiveTracking,
  getLiveRidesTracking,
  getRiderLocationById,
} from '../controllers/tracking.controller';
import { locationUpdateSchema } from '../validations/rider.validation';
import { z } from 'zod';

const router = Router();

router.use(protect);

// Rider location ping (supports both PUT/POST and /location or /update-location from Postman)
router.put('/location', updateLocation);
router.post('/location', updateLocation);
router.put('/update-location', updateLocation);
router.post('/update-location', updateLocation);

// Passenger & Admin Ride Tracking
router.get('/ride/:rideId/location', getRideLocation);
router.get('/ride/:rideId', getRideLocation);

// Emergency SOS trigger (supports rideId or coordinates directly)
router.post('/sos', triggerSOS);

// ==========================================
// ADMIN & SUPER ADMIN TRACKING (FULL ACCESS)
// ==========================================
router.get('/fleet', getFleetLiveTracking);
router.get('/admin/fleet', getFleetLiveTracking);
router.get('/live-rides', getLiveRidesTracking);
router.get('/admin/live-rides', getLiveRidesTracking);
router.get('/rider/:riderId', getRiderLocationById);
router.get('/admin/rider/:riderId', getRiderLocationById);

export default router;
