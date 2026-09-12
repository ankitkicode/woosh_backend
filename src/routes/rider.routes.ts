import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { kycGate } from '../middlewares/auth.middleware';
import { upload } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  getRiderProfile, updateRiderProfile, submitKYC,
  getKYCStatus, toggleOnlineStatus, getEarnings, updateSafetyChecklist, uploadProfileImage
} from '../controllers/rider.controller';
import { updateRiderProfileSchema } from '../validations/rider.validation';

const router = Router();

router.use(protect);

router.get('/profile', getRiderProfile);
router.put('/profile', validate(updateRiderProfileSchema), updateRiderProfile);
router.post('/profile-image', upload.single('image'), uploadProfileImage);
router.post('/kyc', upload.fields([
  { name: 'aadhaar', maxCount: 1 },
  { name: 'driving_license', maxCount: 1 },
  { name: 'pan', maxCount: 1 },
  { name: 'rc_book', maxCount: 1 },
  { name: 'vehicle_insurance', maxCount: 1 },
  { name: 'puc', maxCount: 1 },
  { name: 'police_verification', maxCount: 1 },
  { name: 'face_verification', maxCount: 1 },
  { name: 'selfie_verification', maxCount: 1 },
]), submitKYC);
router.get('/kyc/status', getKYCStatus);
router.put('/safety-checklist', updateSafetyChecklist);
router.put('/status', kycGate, toggleOnlineStatus);
router.get('/earnings', getEarnings);





export default router;
