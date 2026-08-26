/**
 * Woosh Platform — App-wide Constants
 * Single source of truth for all enums and config values.
 */

export enum UserRole {
  PASSENGER = 'passenger',
  RIDER = 'rider',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

export enum KYCStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum RideStatus {
  REQUESTED = 'requested',
  RIDER_SEARCH = 'rider_search',
  RIDER_ASSIGNED = 'rider_assigned',
  ACCEPTED = 'accepted',
  RIDER_EN_ROUTE = 'rider_en_route',
  RIDER_ARRIVED = 'rider_arrived',
  OTP_VERIFICATION = 'otp_verification',
  STARTED = 'started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  PAYMENT_COMPLETED = 'payment_completed',
  CLOSED = 'closed',
  RIDER_CANCELLED = 'rider_cancelled',
  PASSENGER_CANCELLED = 'passenger_cancelled',
  NO_SHOW = 'no_show',
  TIMED_OUT = 'timed_out',
  FAILED_OTP = 'failed_otp',
  SAFETY_HOLD = 'safety_hold',
  SOS_ACTIVE = 'sos_active',
  SUSPENDED = 'suspended',
  REFUND_INITIATED = 'refund_initiated',
  REFUND_COMPLETED = 'refund_completed',
}

export enum CancellationBy {
  PASSENGER = 'passenger',
  RIDER = 'rider',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

export enum PaymentMethod {
  CASH = 'cash',
  UPI = 'upi',
  DEBIT_CARD = 'debit_card',
  CREDIT_CARD = 'credit_card',
  NET_BANKING = 'net_banking',
  WALLET = 'wallet',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum WalletTransactionType {
  TOPUP = 'topup',
  DEBIT = 'debit',
  REFUND = 'refund',
  PAYOUT = 'payout',
}

export enum ComplaintStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum DocumentType {
  AADHAAR = 'aadhaar',
  DRIVING_LICENSE = 'driving_license',
  PAN = 'pan',
  RC_BOOK = 'rc_book',
  VEHICLE_INSURANCE = 'vehicle_insurance',
  PUC = 'puc',
  POLICE_VERIFICATION = 'police_verification',
  FACE_VERIFICATION = 'face_verification',
  SELFIE_VERIFICATION = 'selfie_verification',
}

export enum DisputeCategory {
  FARE = 'fare',
  DRIVER_BEHAVIOUR = 'driver_behaviour',
  PASSENGER_BEHAVIOUR = 'passenger_behaviour',
  ROUTE_ISSUES = 'route_issues',
  LOST_BELONGINGS = 'lost_belongings',
  PAYMENT_ISSUES = 'payment_issues',
  SAFETY_INCIDENTS = 'safety_incidents',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

// OTP expires in 10 minutes
export const OTP_EXPIRY_MINUTES = 10;

// Max OTP resend attempts within window
export const MAX_OTP_ATTEMPTS = 5;

// Rider search radius in km
export const RIDER_SEARCH_RADIUS_KM = 5;

// Max children allowed per passenger account
export const MAX_CHILDREN_PER_ACCOUNT = 5;

// Max child age (below this, adult companion required)
export const MIN_CHILD_AGE_SOLO = 6;
export const MAX_CHILD_AGE = 14;
