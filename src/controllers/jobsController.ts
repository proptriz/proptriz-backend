import { Request, Response } from 'express';
import logger from '../config/loggingConfig';
import { getJobStatus, isKnownJob, runJob } from '../services/jobs.service';

/** POST /internal/jobs/:name — called by the external scheduler. */
export const runScheduledJob = async (req: Request, res: Response) => {
  const { name } = req.params;
  if (!isKnownJob(name)) return res.status(404).json({ message: 'Unknown job' });

  try {
    return res.json(await runJob(name));
  } catch (err) {
    logger.error(`[Jobs] ${name} run failed:`, err);
    return res.status(500).json({ name, status: 'failed' });
  }
}

/** GET /internal/jobs — last run of each job; `overdue` flags a scheduler that has stopped. */
export const listJobStatus = async (_req: Request, res: Response) => {
  try {
    const jobs = await getJobStatus();
    return res.json({ healthy: jobs.every((j) => !j.overdue && j.lastStatus !== 'failed'), jobs });
  } catch (err) {
    logger.error('[Jobs] Status failed:', err);
    return res.status(500).json({ message: 'Failed to load job status' });
  }
}
