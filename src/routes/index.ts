import { Router } from 'express';
import authRoutes from './auth.routes';
import passengerRoutes from './passenger.routes';
import riderRoutes from './rider.routes';
import rideRoutes from './ride.routes';
import trackingRoutes from './tracking.routes';
import paymentRoutes from './payment.routes';
import adminRoutes from './admin.routes';
import superAdminRoutes from './superadmin.routes';

import { getCities } from '../controllers/city.controller';

const router = Router();

// Public Routes
router.get('/cities', getCities);

router.use('/auth', authRoutes);
router.use('/passenger', passengerRoutes);
router.use('/rider', riderRoutes);
router.use('/ride', rideRoutes);
router.use('/tracking', trackingRoutes);
router.use('/payment', paymentRoutes);
router.use('/admin', adminRoutes);
router.use('/superadmin', superAdminRoutes);

export default router;
