import { Router } from 'express';
import { createRiderSupport, getAllRiderSupports, updateRiderSupportStatus } from '../controllers/riderSupport.controller';
import { protect } from '../middlewares/auth.middleware';
import { authorize } from '../middlewares/role.middleware';
import { UserRole } from '../config/constants';

const router = Router();

router.post('/', createRiderSupport); // Public
router.get('/', protect, authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN), getAllRiderSupports);
router.put('/:id/status', protect, authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN), updateRiderSupportStatus);

export default router;
