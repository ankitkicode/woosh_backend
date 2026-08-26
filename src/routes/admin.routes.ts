import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { authorize } from '../middlewares/role.middleware';
import { UserRole } from '../config/constants';
import {
  getDashboard, getPendingRiders, approveRider, rejectRider,
  getAllRiders, getRiderById,
  getActiveRides, getDisputes, resolveDispute,
  getUsers, getSOSAlerts, getInsuranceClaims,
  banUser, unbanUser, resolveSOSAlert, adminLogin
} from '../controllers/admin.controller';
import { processWeeklyPayouts } from '../controllers/payout.controller';

import { getCities, createCity, updateCity, toggleCityStatus } from '../controllers/city.controller';
import { getGateways, createGateway, updateGateway, toggleGatewayStatus } from '../controllers/gateway.controller';
import { getTemplates, createTemplate, updateTemplate, toggleTemplateStatus } from '../controllers/template.controller';
import { getSettings, updateSettings } from '../controllers/settings.controller';

const router = Router();

// Public Routes
router.post('/login', adminLogin);

// Protected Routes
router.use(protect, authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN));

router.get('/dashboard', getDashboard);
router.get('/riders', getAllRiders);
router.get('/riders/pending', getPendingRiders);
router.get('/riders/:id', getRiderById);
router.put('/riders/:id/approve', approveRider);
router.put('/riders/:id/reject', rejectRider);
router.get('/rides/active', getActiveRides);
router.get('/disputes', getDisputes);
router.put('/disputes/:id/resolve', resolveDispute);
router.get('/users', getUsers);
router.get('/sos', getSOSAlerts);
router.put('/sos/:id/resolve', resolveSOSAlert);
router.get('/insurance', getInsuranceClaims);
router.put('/users/:id/ban', banUser);
router.put('/users/:id/unban', unbanUser);
router.post('/payouts/process-weekly', processWeeklyPayouts);

// SUPER_ADMIN ONLY ROUTES
const superAdminOnly = authorize(UserRole.SUPER_ADMIN);

// Cities
router.get('/cities', superAdminOnly, getCities);
router.post('/cities', superAdminOnly, createCity);
router.put('/cities/:id', superAdminOnly, updateCity);
router.put('/cities/:id/toggle', superAdminOnly, toggleCityStatus);

// Gateways
router.get('/gateways', superAdminOnly, getGateways);
router.post('/gateways', superAdminOnly, createGateway);
router.put('/gateways/:id', superAdminOnly, updateGateway);
router.put('/gateways/:id/toggle', superAdminOnly, toggleGatewayStatus);

// Templates
router.get('/templates', superAdminOnly, getTemplates);
router.post('/templates', superAdminOnly, createTemplate);
router.put('/templates/:id', superAdminOnly, updateTemplate);
router.put('/templates/:id/toggle', superAdminOnly, toggleTemplateStatus);

// Settings
router.get('/settings', superAdminOnly, getSettings);
router.put('/settings', superAdminOnly, updateSettings);

export default router;
