# Alerts: environment and scheduler setup

## Backend environment (Vercel)

| Variable | Purpose |
| --- | --- |
| `JOBS_SECRET` | Shared secret for `/api/v1/internal/jobs/*`. Use a long random string. |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` | Resend SMTP: `smtp.resend.com`, `465`, user `resend`, pass = your Resend API key. |
| `EMAIL_FROM` | `Proptriz <info@proptriz.com>` (domain must be verified in Resend). |
| `FIREBASE_*` | Service-account values used by firebase-admin. |
| `ADMIN_API_USERNAME` `ADMIN_API_PASSWORD` | Basic-auth login for the admin send routes. |

## Resend

1. Add `proptriz.com` in Resend, then add the SPF, DKIM and DMARC records it shows at your DNS host.
2. Wait for "Verified", then create an API key and use it as `SMTP_PASS`.

## Scheduler (Cloudflare Worker, free tier)

```
cd scheduler
npx wrangler deploy
npx wrangler secret put JOBS_SECRET   # same value as on Vercel
```

It calls `send-held` every 10 minutes and `daily-digest` every hour.
Check health at `GET /api/v1/internal/jobs` (send `x-job-secret`): `healthy: false` means a job is overdue.

## Upgrade note: device tokens

`device_tokens` documents now link to the user with an ObjectId field `user` (was the string `userId`).
Old rows are ignored, so people re-register on next app open. To clean up: `db.device_tokens.deleteMany({ user: { $exists: false } })`.
