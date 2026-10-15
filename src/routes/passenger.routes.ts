import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { authorize } from '../middlewares/role.middleware';
import { validate } from '../middlewares/validate.middleware';
import { upload } from '../middlewares/upload.middleware';
import { UserRole } from '../config/constants';
import {
  getProfile,
  updateProfile,
  uploadProfileImage,
  addChildProfile,
  getChildProfiles,
  deleteChildProfile,
  submitDispute,
  getSavedPlaces,
  addSavedPlace,
  updateSavedPlace,
  deleteSavedPlace,
  getPaymentMethods,
  addPaymentMethod,
  setDefaultPaymentMethod,
  deletePaymentMethod,
  createSupportTicket,
  getSupportTickets,
  getSupportTicketById,
  addSupportTicketMessage,
  closeSupportTicket,
} from '../controllers/passenger.controller';
import {
  updatePassengerProfileSchema,
  savedPlaceSchema,
  updateSavedPlaceSchema,
  savedPaymentMethodSchema,
  createSupportTicketSchema,
  ticketReplySchema,
} from '../validations/passenger.validation';
import { updateChildSchema, disputeSchema } from '../validations/rider.validation';

const router = Router();

router.use(protect, authorize(UserRole.PASSENGER, UserRole.RIDER));

// Profile
router.get('/profile', getProfile);
router.put('/profile', validate(updatePassengerProfileSchema), updateProfile);
router.post('/profile-image', upload.single('image'), uploadProfileImage);

// Children Profiles
router.post('/children', validate(updateChildSchema), addChildProfile);
router.get('/children', getChildProfiles);
router.delete('/children/:id', deleteChildProfile);

// Disputes
router.post('/disputes', validate(disputeSchema), submitDispute);

// Saved Places
router.get('/saved-places', getSavedPlaces);
router.post('/saved-places', validate(savedPlaceSchema), addSavedPlace);
router.put('/saved-places/:id', validate(updateSavedPlaceSchema), updateSavedPlace);
router.delete('/saved-places/:id', deleteSavedPlace);

// Saved Payment Methods
router.get('/payment-methods', getPaymentMethods);
router.post('/payment-methods', validate(savedPaymentMethodSchema), addPaymentMethod);
router.put('/payment-methods/:id/default', setDefaultPaymentMethod);
router.delete('/payment-methods/:id', deletePaymentMethod);

// Passenger Support Tickets
router.post('/support/tickets', validate(createSupportTicketSchema), createSupportTicket);
router.get('/support/tickets', getSupportTickets);
router.get('/support/tickets/:id', getSupportTicketById);
router.post('/support/tickets/:id/message', validate(ticketReplySchema), addSupportTicketMessage);
router.put('/support/tickets/:id/close', closeSupportTicket);

export default router;
