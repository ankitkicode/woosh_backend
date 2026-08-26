import { Server, Socket } from 'socket.io';
import { RiderProfile } from '../models/RiderProfile';
import { Ride } from '../models/Ride';

/**
 * Woosh Real-Time Tracking Socket Handler
 * Events:
 *  - rider:update_location  → Updates rider GPS in DB and broadcasts to ride room and passenger:home
 *  - rider:status_changed   → Updates online status and broadcasts to passenger:home
 *  - passenger:join_home    → Passenger joins global room to see all active riders
 *  - passenger:join_ride    → Passenger joins a ride room to get live updates
 *  - ride:sos               → SOS alert broadcasted to all admin sockets
 */
export const registerTrackingSocket = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] New connection: ${socket.id}`);

    /**
     * Rider sends location update.
     * Payload: { riderId: string, rideId?: string, latitude: number, longitude: number }
     */
    socket.on('rider:update_location', async (data: {
      riderId: string;
      rideId?: string;
      latitude: number;
      longitude: number;
    }) => {
      try {
        // Update location in DB
        await RiderProfile.findOneAndUpdate(
          { user: data.riderId },
          { currentLocation: { type: 'Point', coordinates: [data.longitude, data.latitude] } }
        );

        const locationData = {
          riderId: data.riderId,
          latitude: data.latitude,
          longitude: data.longitude,
          timestamp: new Date().toISOString(),
        };

        // Broadcast to general passenger home screen
        io.to('passenger:home').emit('location:update', locationData);

        // Broadcast to specific ride room if active
        if (data.rideId) {
          io.to(`ride:${data.rideId}`).emit('location:update', locationData);
        }
      } catch (err) {
        console.error('[Socket] Error updating location:', err);
      }
    });

    /**
     * Rider goes online or offline.
     * Payload: { riderId: string, isOnline: boolean, latitude?: number, longitude?: number }
     */
    socket.on('rider:status_changed', async (data: { riderId: string; isOnline: boolean; latitude?: number; longitude?: number }) => {
      try {
        console.log(`[Socket] Rider ${data.riderId} status changed to ${data.isOnline ? 'Online' : 'Offline'}`);
        
        const updatePayload: any = { isOnline: data.isOnline };
        if (data.latitude && data.longitude) {
          updatePayload.currentLocation = { type: 'Point', coordinates: [data.longitude, data.latitude] };
        }

        await RiderProfile.findOneAndUpdate({ user: data.riderId }, updatePayload);

        // Inform passengers looking at the home map
        io.to('passenger:home').emit('rider:status_changed', {
          riderId: data.riderId,
          isOnline: data.isOnline,
          latitude: data.latitude,
          longitude: data.longitude,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[Socket] Error updating rider status:', err);
      }
    });

    /**
     * Passenger joins the home screen to see active riders.
     */
    socket.on('passenger:join_home', () => {
      socket.join('passenger:home');
      console.log(`[Socket] Passenger joined room: passenger:home`);
    });

    /**
     * Passenger joins a specific ride's room to receive live tracking.
     * Payload: { rideId: string }
     */
    socket.on('passenger:join_ride', (data: { rideId: string }) => {
      socket.join(`ride:${data.rideId}`);
      console.log(`[Socket] Passenger joined room: ride:${data.rideId}`);
    });

    /**
     * Rider joins a specific ride's room.
     * Payload: { rideId: string }
     */
    socket.on('rider:join_ride', (data: { rideId: string }) => {
      socket.join(`ride:${data.rideId}`);
      console.log(`[Socket] Rider joined room: ride:${data.rideId}`);
    });

    /**
     * SOS alert sent from passenger or rider.
     * Payload: { rideId: string, userId: string }
     */
    socket.on('ride:sos', async (data: { rideId: string; userId: string }) => {
      try {
        await Ride.findByIdAndUpdate(data.rideId, { sosTriggeredAt: new Date() });
        // Broadcast to admin room
        io.to('admin:room').emit('sos:alert', {
          rideId: data.rideId,
          userId: data.userId,
          triggeredAt: new Date().toISOString(),
        });
        console.log(`[SOS] Alert for ride ${data.rideId} by user ${data.userId}`);
      } catch (err) {
        console.error('[Socket] Error handling SOS:', err);
      }
    });

    /**
     * Admin joins the admin room to receive SOS alerts.
     */
    socket.on('admin:join', () => {
      socket.join('admin:room');
      console.log(`[Socket] Admin joined admin:room`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });
};
