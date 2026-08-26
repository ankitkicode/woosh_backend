# Woosh Platform — API Documentation

**Base URL:** `http://localhost:5000/api/v1`  
**Auth:** All protected routes require `Authorization: Bearer <access_token>` header.

---

## Standard Response Format

### Success
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Human-readable message",
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error description",
  "errors": ["field.path: specific issue"]
}
```

---

## 1. Auth APIs — `/api/v1/auth`

### `POST /send-otp`
Send OTP to a mobile number.

**Body:**
```json
{ "phoneNumber": "9876543210" }
```

**Response (200):**
```json
{ "data": { "phoneNumber": "9876543210", "otp": "123456" } }
```
> ⚠️ `otp` field only visible in non-production environments.

---

### `POST /verify-otp`
Verify OTP. Returns JWT tokens. Creates account if new user.

**Body:**
```json
{ "phoneNumber": "9876543210", "otp": "123456", "role": "passenger" }
```
> `role` is optional. Accepted values: `passenger`, `rider`. Defaults to `passenger`.

**Response (200):**
```json
{
  "data": {
    "user": { "_id": "...", "phoneNumber": "...", "role": "passenger", "name": null },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "isNewUser": true
  }
}
```

---

### `POST /refresh-token`
Get a new access token using the refresh token.

**Body:**
```json
{ "refreshToken": "eyJ..." }
```

---

### `POST /logout` *(Protected)*
Invalidate refresh token. Log out the user.

---

## 2. Passenger APIs — `/api/v1/passenger`
> 🔒 Requires: `passenger` role

### `GET /profile` — Get passenger profile

### `PUT /profile` — Update profile
```json
{ "name": "Anita Sharma", "email": "anita@example.com" }
```

### `POST /children` — Add child profile
```json
{
  "name": "Riya",
  "age": 8,
  "schoolName": "DPS School",
  "emergencyContactName": "Anita Sharma",
  "emergencyContactPhone": "9876543210"
}
```

### `GET /children` — List all child profiles

### `DELETE /children/:id` — Remove child profile

### `POST /disputes` — Submit dispute (formerly complaint)
```json
{
  "category": "driver_behaviour",
  "subject": "Rude rider behavior",
  "description": "The rider was very rude during the trip...",
  "rideId": "optional-ride-id"
}
```

---

## 3. Rider APIs — `/api/v1/rider`
> 🔒 Requires: Auth token (any role, rider features restricted by KYC)

### `GET /profile` — Get rider profile (user + riderProfile)

### `PUT /profile` — Update profile
```json
{ "name": "Priya Rider", "vehicleNumber": "MH12AB1234", "vehicleModel": "Honda Activa" }
```

### `POST /kyc` — Submit KYC documents
**Content-Type:** `multipart/form-data`  
**Fields:** `aadhaar`, `driving_license`, `pan`, `rc_book` (file uploads), `vehicleNumber` (text)

### `GET /kyc/status` — Get KYC approval status
**Response:** `{ "kycStatus": "under_review", "kycRejectionReason": null }`

### `PUT /status` — Toggle Online/Offline
> ⚠️ Only works if KYC is `approved` and daily checklist is filled.

### `PUT /safety-checklist` — Submit Daily Safety Checklist
```json
{
  "hasHelmet": true,
  "hasFirstAidKit": true,
  "hasSanitaryPads": true,
  "isPhoneCharged": true,
  "hasFaceMask": true
}
```

### `GET /earnings` — Get earnings + recent transactions

---

## 4. Ride APIs — `/api/v1/ride`
> 🔒 Protected

### `POST /estimate` — Get fare estimate (no booking)
```json
{
  "pickup": { "latitude": 19.076, "longitude": 72.877, "address": "Andheri Station" },
  "drop":   { "latitude": 19.054, "longitude": 72.841, "address": "Bandra Station" }
}
```
**Response:**
```json
{
  "data": {
    "distanceKm": 4.2,
    "durationMinutes": 11,
    "fare": { "baseFare": 20, "distanceFare": 42, "timeFare": 16.5, "totalFare": 79, "isSurge": false }
  }
}
```

### `POST /request` — Book a ride
```json
{
  "pickup": { "latitude": 19.076, "longitude": 72.877, "address": "Andheri Station" },
  "drop":   { "latitude": 19.054, "longitude": 72.841, "address": "Bandra Station" },
  "paymentMethod": "cash",
  "childProfileId": "optional-child-id"
}
```

### `GET /nearby-riders?latitude=19.076&longitude=72.877` — Find nearby available riders

### `GET /history?page=1&limit=10` — Paginated ride history

### `GET /:id` — Get ride details

### `PUT /:id/accept` — Rider accepts ride *(rider role)*

### `PUT /:id/arrived` — Rider arrived at pickup *(rider role)*

### `PUT /:id/start` — Start ride with OTP *(rider role)*
```json
{ "otp": "4532" }
```

### `PUT /:id/complete` — Complete ride *(rider role)*

### `PUT /:id/cancel` — Cancel ride *(passenger or rider)*
```json
{ "reason": "Passenger not reachable" }
```

---

## 5. Tracking APIs — `/api/v1/tracking`
> 🔒 Protected

### `PUT /location` — Update rider GPS (called every 2-5s during ride)
```json
{ "latitude": 19.076, "longitude": 72.877 }
```

### `GET /ride/:rideId/location` — Get rider's current location (for passenger)

### `POST /sos` — Trigger SOS
```json
{ "rideId": "ride-object-id" }
```

---

## 6. Payment APIs — `/api/v1/payment`
> 🔒 Protected

### `GET /wallet` — Get wallet balance

### `POST /wallet/topup/order` — Create Topup Order (Razorpay)
```json
{ "amount": 500 }
```

### `POST /wallet/topup/verify` — Verify Topup Payment
```json
{
  "razorpay_order_id": "order_XXXX",
  "razorpay_payment_id": "pay_XXXX",
  "razorpay_signature": "XXXXX",
  "amount": 500
}
```

### `GET /transactions?page=1&limit=20` — Wallet transaction history

---

## 7. Admin APIs — `/api/v1/admin`
> 🔒 Requires: `admin` or `super_admin` role

### `GET /dashboard` — Platform stats overview

### `GET /riders/pending?page=1&limit=15` — Riders awaiting KYC

### `PUT /riders/:id/approve` — Approve rider KYC

### `PUT /riders/:id/reject` — Reject rider KYC
```json
{ "reason": "Aadhaar document is blurry" }
```

### `GET /rides/active` — All active live rides

### `GET /disputes?status=open&page=1&limit=15` — Get disputes
> Query param `status`: `open` | `in_progress` | `resolved` | `closed`

### `PUT /disputes/:id/resolve` — Resolve a dispute
```json
{ "adminNotes": "Refund issued to passenger.", "resolution": "refunded" }
```

---

## 8. Super Admin APIs — `/api/v1/superadmin`
> 🔒 Requires: `super_admin` role

### `POST /cities` — Add a new city
```json
{ "city": "mumbai", "baseFare": 20, "costPerKm": 12, "costPerMinute": 1.5, "minFare": 40 }
```

### `GET /cities` — List all cities with pricing

### `PUT /pricing/:city` — Update city pricing
```json
{ "isSurgeActive": true, "surgeMultiplier": 1.5, "baseFare": 25 }
```

### `GET /pricing/:city` — Get pricing for a specific city

### `GET /stats` — Platform-wide revenue and user stats

---

## WebSocket Events (Socket.io)

**Connection URL:** `ws://localhost:5000`

| Event | Direction | Payload |
|-------|-----------|---------|
| `rider:update_location` | Client → Server | `{ riderId, rideId, latitude, longitude }` |
| `location:update` | Server → Room | `{ latitude, longitude, timestamp }` |
| `passenger:join_ride` | Client → Server | `{ rideId }` |
| `rider:join_ride` | Client → Server | `{ rideId }` |
| `ride:sos` | Client → Server | `{ rideId, userId }` |
| `sos:alert` | Server → Admin Room | `{ rideId, userId, triggeredAt }` |
| `admin:join` | Client → Server | _(no payload)_ |

---

## HTTP Status Codes Used

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Resource Created |
| 400 | Bad Request / Invalid input |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (wrong role or inactive account) |
| 404 | Resource not found |
| 409 | Conflict (duplicate entry) |
| 422 | Unprocessable Entity (Zod validation failed) |
| 500 | Internal Server Error |
