import { Client } from '@googlemaps/google-maps-services-js';
import 'dotenv/config';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const mapsClient = new Client({});

export const mapsService = {
  /**
   * Get distance and duration between two coordinates
   */
  async getDistanceAndDuration(originLat: number, originLng: number, destLat: number, destLng: number) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    if (!apiKey) {
      throw new Error('Google Maps API Key is not configured in .env');
    }

    try {
      const response = await mapsClient.distancematrix({
        params: {
          origins: [{ lat: originLat, lng: originLng }],
          destinations: [{ lat: destLat, lng: destLng }],
          key: apiKey,
        },
      });

      const element = response.data.rows[0].elements[0];
      if (element.status === 'OK') {
        return {
          distanceKm: element.distance.value / 1000,
          durationMins: Math.ceil(element.duration.value / 60),
        };
      } else if (element.status === 'ZERO_RESULTS') {
        // Fallback for unreachable destinations (e.g., emulator in USA, destination in India)
        console.warn('ROUTE_NOT_FOUND: Falling back to straight-line distance');
        const distanceKm = calculateStraightLineDistance(originLat, originLng, destLat, destLng);
        return {
          distanceKm,
          durationMins: Math.ceil((distanceKm / 40) * 60), // Assuming average 40 km/h speed
        };
      }
      throw new Error(`Maps API returned status: ${element.status}`);
    } catch (error) {
      console.error('Error fetching distance from Google Maps:', error);
      throw error;
    }
  },
};

// Helper: Haversine formula to calculate straight-line distance
function calculateStraightLineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}
