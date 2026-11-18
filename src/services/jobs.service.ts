// src/services/jobs.service.ts
// Scheduled jobs. The backend has no background workers (Vercel serverless),
// so an external scheduler calls POST /internal/jobs/:name. Each job does a
// bounded amount of work and returns; the next call continues.

import logger from '../config/loggingConfig';
import { JobRun } from '../models/jobRun';
import { sendDailyDigests, sendHeldPushes } from './alertRouter.service';

interface JobDefinition {
  run: (now: Date) => Promise<Record<string, unknown>>;
  /** How often the scheduler is expected to call it. */
  everyMinutes: number;
  description: string;
}

export const JOBS: Record<string, JobDefinition> = {
  'send-held': {
    run: (now) => sendHeldPushes(now),
    everyMinutes: 10,
    description: 'Sends pushes that were held for quiet hours',
  },
  'daily-digest': {
    run: (now) => sendDailyDigests(now),
    everyMinutes: 60,
    description: 'Emails people whose digest hour it is in their time zone',
  },
};

export const isKnownJob = (name: string): boolean => Object.prototype.hasOwnProperty.call(JOBS, name);

export async function runJob(name: string, now: Date = new Date()) {
  const job = JOBS[name];
  if (!job) throw new Error(`Unknown job: ${name}`);

  await JobRun.updateOne(
    { name },
    { $set: { lastStartedAt: now, lastStatus: 'running' }, $unset: { lastError: 1 }, $inc: { runs: 1 } },
    { upsert: true },
  );

  try {
    const result = await job.run(now);
    await JobRun.updateOne({ name }, { $set: { lastFinishedAt: new Date(), lastStatus: 'ok', lastResult: result } });
    return { name, status: 'ok' as const, result };
  } catch (err: any) {
    logger.error(`[Jobs] ${name} failed:`, err);
    await JobRun.updateOne(
      { name },
      { $set: { lastFinishedAt: new Date(), lastStatus: 'failed', lastError: String(err?.message ?? err).slice(0, 500) } },
    );
    throw err;
  }
}

/** Last run of every job, flagging any that is overdue (three missed runs). */
export async function getJobStatus(now: Date = new Date()) {
  const runs = await JobRun.find({ name: { $in: Object.keys(JOBS) } }).lean();
  const byName = new Map(runs.map((r) => [r.name, r]));

  return Object.entries(JOBS).map(([name, job]) => {
    const last = byName.get(name);
    const overdueAfterMs = job.everyMinutes * 3 * 60_000;
    const overdue = !last || now.getTime() - new Date(last.lastStartedAt).getTime() > overdueAfterMs;
    return {
      name,
      description: job.description,
      everyMinutes: job.everyMinutes,
      lastStartedAt: last?.lastStartedAt ?? null,
      lastFinishedAt: last?.lastFinishedAt ?? null,
      lastStatus: last?.lastStatus ?? 'never',
      lastResult: last?.lastResult ?? null,
      lastError: last?.lastError ?? null,
      overdue,
    };
  });
}
