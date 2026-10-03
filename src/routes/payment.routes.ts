import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { getWallet, createTopupOrder, verifyTopupPayment, getTransactions, createRideOrder, verifyRidePayment } from '../controllers/payment.controller';
import { walletTopupSchema } from '../validations/rider.validation';

const router = Router();

router.use(protect);

router.get('/wallet', getWallet);
router.post('/wallet/topup/order', validate(walletTopupSchema), createTopupOrder);
router.post('/wallet/topup/verify', verifyTopupPayment);
router.get('/transactions', getTransactions);

router.post('/ride/:id/order', createRideOrder);
router.post('/ride/:id/verify', verifyRidePayment);

export default router;
