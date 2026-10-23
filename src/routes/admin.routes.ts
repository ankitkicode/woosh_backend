import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { authorize } from '../middlewares/role.middleware';
import { UserRole } from '../config/constants';
import {
  getDashboard, getPendingRiders, approveRider, rejectRider, updateDocumentStatus,
  getAllRiders, getRiderById, deleteRider,
  getActiveRides, getAllRides, getRideById, cancelRideByAdmin,
  getDisputes, resolveDispute, getDisputeById,
  getUsers, getSOSAlerts, getInsuranceClaims,
  banUser, unbanUser, resolveSOSAlert, markSOSFalseAlarm,
  updateInsuranceClaimStatus, getPassengerById, deletePassenger, adminLogin,
  listPayoutRequests,
  updatePayoutRequest,
  bulkUpdatePayouts,
  getRiderWalletHistory,
  fetchAnalytics,
  broadcastNotification,
  getBroadcastHistory,
  sendUserNotification,
  deleteBroadcast,
  listAdmins,
  createAdmin,
  updateAdmin,
  toggleAdmin,
  deleteAdmin,
  getAdminSupportTickets,
  getAdminSupportTicketById,
  replySupportTicket,
  updateSupportTicketStatus
} from '../controllers/admin.controller';

import { getFleetLiveTracking, getLiveRidesTracking, getRiderLocationById, getRideLocation } from '../controllers/tracking.controller';
import { getCities, createCity, updateCity, toggleCityStatus, getCityById, deleteCity } from '../controllers/city.controller';
import { getGateways, createGateway, updateGateway, toggleGatewayStatus } from '../controllers/gateway.controller';
import { getSettings, updateSettings } from '../controllers/settings.controller';
import { toggleOnlineStatus } from '../controllers/rider.controller';

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
router.put('/rides/:id/cancel', cancelRideByAdmin);

// Riders
router.get('/riders', getAllRiders);
router.get('/riders/pending', getPendingRiders);
router.get('/riders/:id', getRiderById);
router.delete('/riders/:id', deleteRider);
router.put('/riders/:id/approve', approveRider);
router.put('/riders/:id/reject', rejectRider);
router.put('/riders/:id/status', toggleOnlineStatus);
router.put('/riders/:id/documents/:docType/status', updateDocumentStatus);

// Disputes
router.get('/disputes', getDisputes);
router.get('/disputes/:id', getDisputeById);
router.put('/disputes/:id/resolve', resolveDispute);

// Users & Passengers
router.get('/users', getUsers);
router.get('/passengers/:id', getPassengerById);
router.delete('/passengers/:id', deletePassenger);
router.delete('/users/:id', deletePassenger);
router.put('/users/:id/ban', banUser);
router.put('/users/:id/unban', unbanUser);

// Push Notifications (Admin Broadcast & Targeted)
router.post('/notifications/broadcast', broadcastNotification);
router.get('/notifications/broadcasts', getBroadcastHistory);
router.delete('/notifications/broadcasts/:id', deleteBroadcast);
router.post('/notifications/send-user', sendUserNotification);

// Fleet & Live Ride GPS Tracking
router.get('/tracking/fleet', getFleetLiveTracking);
router.get('/tracking/live-rides', getLiveRidesTracking);
router.get('/tracking/rider/:riderId', getRiderLocationById);
router.get('/tracking/ride/:rideId', getRideLocation);

// SOS
router.get('/sos', getSOSAlerts);
router.put('/sos/:id/resolve', resolveSOSAlert);
router.put('/sos/:id/false-alarm', markSOSFalseAlarm);

// Insurance
router.get('/insurance', getInsuranceClaims);
router.put('/insurance/:id/status', updateInsuranceClaimStatus);

// Payouts


// Support Tickets
router.get('/support/tickets', getAdminSupportTickets);
router.get('/support/tickets/:id', getAdminSupportTicketById);
router.post('/support/tickets/:id/reply', replySupportTicket);
router.put('/support/tickets/:id/status', updateSupportTicketStatus);

// Admin Management
router.get('/admins', listAdmins);
router.post('/admins', createAdmin);
router.put('/admins/:id', updateAdmin);
router.put('/admins/:id/toggle', toggleAdmin);
router.delete('/admins/:id', deleteAdmin);

// Cities
router.get('/cities', getCities);
router.post('/cities', createCity);
router.get('/cities/:id', getCityById);
router.put('/cities/:id', updateCity);
router.put('/cities/:id/toggle', toggleCityStatus);
router.delete('/cities/:id', deleteCity);

// Gateways
router.get('/gateways', getGateways);
router.post('/gateways', createGateway);
router.put('/gateways/:id', updateGateway);
router.put('/gateways/:id/toggle', toggleGatewayStatus);

// Settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// ==========================================
// PAYOUTS & WALLET
// ==========================================
router.get('/payouts', listPayoutRequests);
router.post('/payouts/bulk', bulkUpdatePayouts);
router.put('/payouts/:id', updatePayoutRequest);
router.get('/riders/:id/wallet-history', getRiderWalletHistory);
router.get('/riders/:id/wallet', getRiderWalletHistory);

export default router;
