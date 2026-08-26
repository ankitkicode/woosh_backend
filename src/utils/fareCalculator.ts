/**
 * Woosh Fare Calculator Utility
 * Calculates estimated fare based on PRD pricing rules.
 * Accepts optional overrides from PricingRule (city-wise DB pricing).
 */

interface FareInput {
  distanceKm: number;
  durationMinutes: number;
  isSurge?: boolean;
  surgeMultiplier?: number;
  baseFare?: number;      // Override from PricingRule
  costPerKm?: number;     // Override from PricingRule
  costPerMinute?: number; // Override from PricingRule
}

interface FareOutput {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  totalFare: number;
  isSurge: boolean;
  surgeMultiplier: number;
}

// Default pricing constants (used when no PricingRule exists for the city)
const DEFAULT_BASE_FARE = 20;          // ₹20 flat base fare
const DEFAULT_COST_PER_KM = 10;        // ₹10 per km
const DEFAULT_COST_PER_MINUTE = 1.5;   // ₹1.50 per minute

/**
 * Calculates the fare for a ride.
 * If city-wise pricing overrides are provided, they take priority over defaults.
 */
export const calculateFare = (input: FareInput): FareOutput => {
  const {
    distanceKm,
    durationMinutes,
    isSurge = false,
    surgeMultiplier = 1.0,
    baseFare = DEFAULT_BASE_FARE,
    costPerKm = DEFAULT_COST_PER_KM,
    costPerMinute = DEFAULT_COST_PER_MINUTE,
  } = input;

  const distanceFare = distanceKm * costPerKm;
  const timeFare = durationMinutes * costPerMinute;
  const rawTotal = baseFare + distanceFare + timeFare;
  const totalFare = Math.ceil(rawTotal * (isSurge ? surgeMultiplier : 1.0));

  return {
    baseFare,
    distanceFare: parseFloat(distanceFare.toFixed(2)),
    timeFare: parseFloat(timeFare.toFixed(2)),
    totalFare,
    isSurge,
    surgeMultiplier: isSurge ? surgeMultiplier : 1.0,
  };
};

/**
 * Haversine formula: calculates distance in km between two GPS coordinates.
 */
export const getDistanceInKm = (
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2));
};
