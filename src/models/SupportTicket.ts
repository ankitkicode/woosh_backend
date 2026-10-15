import mongoose, { Document, Schema } from 'mongoose';

export interface ISupportMessage {
  sender: 'passenger' | 'support_agent' | 'system';
  senderUser?: mongoose.Types.ObjectId | string;
  message: string;
  attachments?: string[];
  createdAt: Date;
}

export interface ISupportTicket extends Document {
  ticketNumber: string;
  passenger: mongoose.Types.ObjectId | string;
  ride?: mongoose.Types.ObjectId | string;
  category:
    | 'fare_issue'
    | 'driver_behavior'
    | 'lost_item'
    | 'safety_incident'
    | 'route_detour'
    | 'app_payment_issue'
    | 'cancellation_fee'
    | 'other';
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  messages: ISupportMessage[];
  resolvedAt?: Date;
  resolutionSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const supportTicketSchema = new Schema<ISupportTicket>(
  {
    ticketNumber: { type: String, required: true, unique: true, index: true },
    passenger: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ride: { type: Schema.Types.ObjectId, ref: 'Ride' },
    category: {
      type: String,
      required: true,
      enum: [
        'fare_issue',
        'driver_behavior',
        'lost_item',
        'safety_incident',
        'route_detour',
        'app_payment_issue',
        'cancellation_fee',
        'other',
      ],
    },
    subject: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
      default: 'OPEN',
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
    },
    messages: [
      {
        sender: { type: String, enum: ['passenger', 'support_agent', 'system'], required: true },
        senderUser: { type: Schema.Types.ObjectId, ref: 'User' },
        message: { type: String, required: true },
        attachments: [{ type: String }],
        createdAt: { type: Date, default: Date.now },
      },
    ],
    resolvedAt: { type: Date },
    resolutionSummary: { type: String },
  },
  { timestamps: true }
);

export const SupportTicket = mongoose.model<ISupportTicket>('SupportTicket', supportTicketSchema);
