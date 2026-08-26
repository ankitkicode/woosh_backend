import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';

import { connectDB } from './config/db';
import { ApiError } from './utils/ApiError';
import { ApiResponse } from './utils/ApiResponse';
import { registerTrackingSocket } from './sockets/tracking.socket';
import { startRideAssignmentCron } from './cron/rideAssignment.cron';
import routes from './routes/index';

dotenv.config();

// Connect to MongoDB
connectDB();

// Start Background Jobs
startRideAssignmentCron();

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URLS?.split(',') || '*', credentials: true },
});
registerTrackingSocket(io);

// ─── Swagger Documentation ──────────────────────────────────────────
const swaggerFile = path.join(__dirname, '../docs/swagger_output.json');
let swaggerDocument = {};
try {
  if (fs.existsSync(swaggerFile)) {
    swaggerDocument = JSON.parse(fs.readFileSync(swaggerFile, 'utf8'));
  }
} catch (error) {
  console.log('Swagger file not found or invalid');
}
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ─── Global Security Middlewares ─────────────────────────────────────
// 1. Set security HTTP headers
app.use(helmet());

// 2. Rate limiting (Max 100 requests per 10 mins per IP)
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 10 minutes'
});
app.use('/api', limiter);

app.use(cors({ origin: process.env.CLIENT_URLS?.split(',') || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 3. Data sanitization against NoSQL query injection
// app.use(mongoSanitize()); // Note: Disabled because it is incompatible with Express 5 (req.query is read-only)

// 4. Prevent HTTP Parameter Pollution
// app.use(hpp()); // Note: Disabled because hpp is incompatible with Express 5 (req.query is read-only)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ─── API Routes ─────────────────────────────────────────────────────
app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.status(200).json(new ApiResponse(200, 'Woosh Backend API is running 🚀', {
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  }));
});

app.use('/api/v1', routes);

// 404 handler
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new ApiError(404, 'API route not found'));
});

// ─── Global Error Handler ────────────────────────────────────────────
app.use((err: ApiError, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  console.error(`[Error] ${statusCode}: ${err.message}`);
  if (err.errors && err.errors.length > 0) {
    console.error('Validation Details:', err.errors);
  }
  res.status(statusCode).json({
    success: false,
    statusCode,
    message: err.message || 'Internal Server Error',
    errors: err.errors || [],
  });
});

// ─── Start Server ────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n✅ Woosh Backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});
