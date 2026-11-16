// Proptriz alert scheduler: a Cloudflare Worker that calls the backend's job endpoints.
// Vercel Hobby cron only runs once a day, so this does the frequent runs for free.
//
// Triggers (see wrangler.toml):
//   */10 * * * *  -> send-held     (push held back during quiet hours)
//   0 * * * *     -> daily-digest  (emails at each person's local digest hour)
//
// Secrets (wrangler secret put ...):  JOBS_SECRET
// Vars (wrangler.toml):               API_BASE, e.g. https://api.proptriz.com/api/v1

const JOB_BY_CRON = {
  '*/10 * * * *': 'send-held',
  '0 * * * *': 'daily-digest',
};

async function callJob(env, name) {
  const res = await fetch(`${env.API_BASE}/internal/jobs/${name}`, {
    method: 'POST',
    headers: { 'x-job-secret': env.JOBS_SECRET },
  });
  if (!res.ok) throw new Error(`${name} failed with ${res.status}`);
  return res.status;
}

export default {
  async scheduled(event, env, ctx) {
    const name = JOB_BY_CRON[event.cron];
    if (!name) return;
    ctx.waitUntil(callJob(env, name));
  },
};
