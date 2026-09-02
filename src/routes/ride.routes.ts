import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  estimateFare, requestRide, getNearbyRiders,
  acceptRide, rejectRide, riderArrived, startRide, completeRide, cancelRide,
  getRideDetails, getRideHistory, rateRide,
} from '../controllers/ride.controller';
import { rideEstimateSchema, requestRideSchema, cancelRideSchema } from '../validations/ride.validation';

const router = Router();

router.use(protect);

router.post('/estimate', validate(rideEstimateSchema), 
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: {
          pickup: { latitude: 19.076, longitude: 72.877, address: "Andheri" },
          drop: { latitude: 19.054, longitude: 72.841, address: "Bandra" }
        }
  } */
estimateFare);

router.post('/request', validate(requestRideSchema), 
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: {
          pickup: { latitude: 19.076, longitude: 72.877, address: "Andheri" },
          drop: { latitude: 19.054, longitude: 72.841, address: "Bandra" },
          paymentMethod: "cash",
          childProfileId: ""
        }
  } */
requestRide);
router.get('/nearby-riders', getNearbyRiders);
router.get('/history', getRideHistory);
router.get('/:id', getRideDetails);
router.put('/:id/accept', acceptRide);
router.put('/:id/reject', rejectRide);
router.put('/:id/arrived', riderArrived);
router.put('/:id/start', 
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: { otp: "123456" }
  } */
startRide);
router.put('/:id/complete', completeRide);
router.put('/:id/cancel', validate(cancelRideSchema), 
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: { reason: "Passenger not responding" }
  } */
cancelRide);
router.put('/:id/rate', rateRide);

export default router;
