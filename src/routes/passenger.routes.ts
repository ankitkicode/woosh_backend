import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { authorize } from '../middlewares/role.middleware';
import { validate } from '../middlewares/validate.middleware';
import { UserRole } from '../config/constants';
import {
  getProfile, updateProfile,
  addChildProfile, getChildProfiles, deleteChildProfile,
  submitDispute,
} from '../controllers/passenger.controller';
import { updateChildSchema, disputeSchema, updatePassengerProfileSchema } from '../validations/rider.validation';

const router = Router();

router.use(protect, authorize(UserRole.PASSENGER));

router.get('/profile', getProfile);
router.put('/profile', validate(updatePassengerProfileSchema), updateProfile);
router.post('/children', validate(updateChildSchema), addChildProfile);
router.get('/children', getChildProfiles);
router.delete('/children/:id', deleteChildProfile);
router.post('/disputes', validate(disputeSchema), submitDispute);

export default router;
