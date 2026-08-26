import { Router } from 'express';
import { sendOTP, verifyOTP, refreshToken, logout, logoutAllDevices, getActiveSessions, verifyGender } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { protect } from '../middlewares/auth.middleware';
import { upload } from '../middlewares/upload.middleware';
import { sendOTPSchema, verifyOTPSchema, refreshTokenSchema, logoutSchema } from '../validations/auth.validation';

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

router.post('/logout', protect, validate(logoutSchema), 
  /*  #swagger.parameters['body'] = {
        in: 'body',
        schema: { deviceId: "A1B2C3D4" }
  } */
logout);

router.post('/logout-all', protect, logoutAllDevices);
router.get('/sessions', protect, getActiveSessions);

export default router;
