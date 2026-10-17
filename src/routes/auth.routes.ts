import { Router } from 'express';
import { 
  sendOTP, verifyOTP, refreshToken, logout, logoutAllDevices, getActiveSessions, verifyGender,
  setMpin, verifyMpin, changeMpin, forgotMpin, updateFcmToken
} from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { protect } from '../middlewares/auth.middleware';
import { upload } from '../middlewares/upload.middleware';
import { 
  sendOTPSchema, verifyOTPSchema, refreshTokenSchema, logoutSchema,
  setMpinSchema, verifyMpinSchema, changeMpinSchema, forgotMpinSchema,
  updateFcmTokenSchema
} from '../validations/auth.validation';

const router = Router();

router.post('/verify-gender', upload.single('selfie'), verifyGender);

router.post(
  '/send-otp',
  validate(sendOTPSchema),
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: { phoneNumber: "9876543210" }
  } */
  sendOTP
);

router.post(
  '/verify-otp',
  validate(verifyOTPSchema),
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: { phoneNumber: "9876543210", otp: "123456", role: "passenger" }
  } */
  verifyOTP
);

// MPIN Routes (App Quick Lock & Unlock)
router.post('/set-mpin', protect, validate(setMpinSchema), setMpin);
router.post('/verify-mpin', validate(verifyMpinSchema), verifyMpin);
router.post('/change-mpin', protect, validate(changeMpinSchema), changeMpin);
router.post('/forgot-mpin', validate(forgotMpinSchema), forgotMpin);

router.post(
  '/refresh-token',
  validate(refreshTokenSchema),
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: { refreshToken: "your_refresh_token_here" }
  } */
  refreshToken
);

router.post('/logout', protect, validate(logoutSchema), logout);

router.post('/logout-all', protect, logoutAllDevices);
router.get('/sessions', protect, getActiveSessions);
router.put('/fcm-token', protect, validate(updateFcmTokenSchema), updateFcmToken);

export default router;

