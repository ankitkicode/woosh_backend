import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { updateLocation, getRideLocation, triggerSOS } from '../controllers/tracking.controller';
import { locationUpdateSchema } from '../validations/rider.validation';
import { z } from 'zod';

const router = Router();

router.use(protect);

router.put('/location', validate(locationUpdateSchema), updateLocation);
router.get('/ride/:rideId/location', getRideLocation);
router.post('/sos', validate(z.object({ rideId: z.string().min(1, 'Ride ID required') })), triggerSOS);

export default router;
