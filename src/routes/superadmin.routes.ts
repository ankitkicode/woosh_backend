import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { authorize } from '../middlewares/role.middleware';
import { UserRole } from '../config/constants';
import { addCity, getAllCities, updatePricing, getPricing, getPlatformStats, getSystemConfig, updateSystemConfig } from '../controllers/superadmin.controller';

const router = Router();

router.use(protect, authorize(UserRole.SUPER_ADMIN));

router.post('/cities', addCity);
router.get('/cities', getAllCities);
router.put('/pricing/:city', updatePricing);
router.get('/pricing/:city', getPricing);
router.get('/stats', getPlatformStats);
router.get('/config', getSystemConfig);
router.put('/config', updateSystemConfig);

export default router;
