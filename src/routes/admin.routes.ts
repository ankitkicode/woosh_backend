import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { authorize } from '../middlewares/role.middleware';
import { UserRole } from '../config/constants';
import {
  getDashboard, getPendingRiders, approveRider, rejectRider, updateDocumentStatus,
  getAllRiders, getRiderById, deleteRider,
  getActiveRides, getAllRides, getRideById,
  getDisputes, resolveDispute,
  getUsers, getSOSAlerts, getInsuranceClaims,
  banUser, unbanUser, resolveSOSAlert, markSOSFalseAlarm,
  updateInsuranceClaimStatus, getPassengerById, adminLogin,
  listPayoutRequests,
  updatePayoutRequest,
  getRiderWalletHistory,
  fetchAnalytics
} from '../controllers/admin.controller';

import { getCities, createCity, updateCity, toggleCityStatus, getCityById, deleteCity } from '../controllers/city.controller';
import { getGateways, createGateway, updateGateway, toggleGatewayStatus } from '../controllers/gateway.controller';
import { getSettings, updateSettings } from '../controllers/settings.controller';

const router = Router();

// Public Routes
router.post('/login', adminLogin);

// Protected Routes
router.use(protect, authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN));

router.get('/analytics', fetchAnalytics);

router.get('/dashboard', getDashboard);

// Rides
router.get('/rides', getAllRides);
router.get('/rides/active', getActiveRides);
router.get('/rides/:id', getRideById);

// Riders
router.get('/riders', getAllRiders);
router.get('/riders/pending', getPendingRiders);
router.get('/riders/:id', getRiderById);
router.delete('/riders/:id', deleteRider);
router.put('/riders/:id/approve', approveRider);
router.put('/riders/:id/reject', rejectRider);
router.put('/riders/:id/documents/:docType/status', updateDocumentStatus);

// Disputes
router.get('/disputes', getDisputes);
router.put('/disputes/:id/resolve', resolveDispute);

// Users & Passengers
router.get('/users', getUsers);
router.get('/passengers/:id', getPassengerById);
router.put('/users/:id/ban', banUser);
router.put('/users/:id/unban', unbanUser);

// SOS
router.get('/sos', getSOSAlerts);
router.put('/sos/:id/resolve', resolveSOSAlert);
router.put('/sos/:id/false-alarm', markSOSFalseAlarm);

// Insurance
router.get('/insurance', getInsuranceClaims);
router.put('/insurance/:id/status', updateInsuranceClaimStatus);

// Payouts


// SUPER_ADMIN ONLY ROUTES
const superAdminOnly = authorize(UserRole.SUPER_ADMIN);

// Cities
router.get('/cities',  getCities);
router.post('/cities', superAdminOnly, createCity);
router.get('/cities/:id', superAdminOnly, getCityById);
router.put('/cities/:id', superAdminOnly, updateCity);
router.put('/cities/:id/toggle', superAdminOnly, toggleCityStatus);
router.delete('/cities/:id', superAdminOnly, deleteCity);

// Gateways
router.get('/gateways', superAdminOnly, getGateways);
router.post('/gateways', superAdminOnly, createGateway);
router.put('/gateways/:id', superAdminOnly, updateGateway);
router.put('/gateways/:id/toggle', superAdminOnly, toggleGatewayStatus);

// Settings
router.get('/settings', superAdminOnly, getSettings);
router.put('/settings', superAdminOnly, updateSettings);
// ==========================================
// PAYOUTS & WALLET
// ==========================================
router.get('/payouts', listPayoutRequests);
router.put('/payouts/:id', updatePayoutRequest);
router.get('/riders/:id/wallet-history', getRiderWalletHistory);

export default router;
