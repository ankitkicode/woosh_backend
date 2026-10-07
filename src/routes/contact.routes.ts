import { Router } from 'express';
import { createContact, getAllContacts, updateContactStatus } from '../controllers/contact.controller';
import { protect } from '../middlewares/auth.middleware';
import { authorize } from '../middlewares/role.middleware';
import { UserRole } from '../config/constants';

const router = Router();

router.post('/', createContact); // Public
router.get('/', protect, authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN), getAllContacts);
router.put('/:id/status', protect, authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN), updateContactStatus);

export default router;
