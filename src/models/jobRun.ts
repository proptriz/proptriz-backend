// src/models/jobRun.ts
// Last run of each scheduled job, so a scheduler that stops silently is visible.
import { Schema, model, Document } from 'mongoose';

export interface IJobRun extends Document {
  name: string;
  lastStartedAt: Date;
  lastFinishedAt?: Date;
  lastStatus: 'running' | 'ok' | 'failed';
  lastResult?: Record<string, unknown>;
  lastError?: string;
  runs: number;
}

const JobRunSchema = new Schema<IJobRun>(
  {
    name: { type: String, required: true, unique: true },
    lastStartedAt: { type: Date, required: true },
    lastFinishedAt: Date,
    lastStatus: { type: String, enum: ['running', 'ok', 'failed'], required: true },
    lastResult: Schema.Types.Mixed,
    lastError: String,
    runs: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'job_runs' }
);

export const JobRun = model<IJobRun>('JobRun', JobRunSchema);
