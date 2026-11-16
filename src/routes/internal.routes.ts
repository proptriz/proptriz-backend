// src/routes/internal.routes.ts
// Scheduler entry points. Every route needs the shared JOBS_SECRET.
import { Router } from 'express';
import { verifyJobSecret } from '../middlewares/verifyToken';
import { listJobStatus, runScheduledJob } from '../controllers/jobsController';

const internalRoutes = Router();

internalRoutes.get('/jobs', verifyJobSecret, listJobStatus);
internalRoutes.post('/jobs/:name', verifyJobSecret, runScheduledJob);

export default internalRoutes;
