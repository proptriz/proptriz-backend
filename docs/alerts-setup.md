# Alerts: environment and scheduler setup

## Backend environment (Vercel)

| Variable | Purpose |
| --- | --- |
| `JOBS_SECRET` | Shared secret for `/api/v1/internal/jobs/*`. Use a long random string. |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` | Resend SMTP: `smtp.resend.com`, `465`, user `resend`, pass = your Resend API key. |
| `EMAIL_FROM` | `Proptriz <info@proptriz.com>` (domain must be verified in Resend). |
| `FIREBASE_PROJECT_ID` `FIREBASE_CLIENT_EMAIL` `FIREBASE_PRIVATE_KEY` | Service-account values for firebase-admin (see Firebase below). Keep the key's `\n` characters as typed in the JSON, or paste it with real line breaks. |
| `ADMIN_API_USERNAME` `ADMIN_API_PASSWORD` | Basic-auth login for the admin send routes. |

## Firebase (push)

One Firebase project serves web, Android and iOS.

1. Firebase console -> Project settings -> General -> add a **Web app**. Its config gives the frontend
   `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_SENDER_ID` (messagingSenderId), `_APP_ID`.
2. Project settings -> Cloud Messaging -> make sure **Firebase Cloud Messaging API (V1)** is Enabled, then under
   **Web Push certificates** generate a key pair. The public key is the frontend `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
3. Project settings -> Service accounts -> **Generate new private key**. From the downloaded JSON, set on the backend:
   `FIREBASE_PROJECT_ID` = `project_id`, `FIREBASE_CLIENT_EMAIL` = `client_email`, `FIREBASE_PRIVATE_KEY` = `private_key`.
   Treat the file as a password; do not commit it.
   Easier and less error-prone: set a single variable `FIREBASE_SERVICE_ACCOUNT_JSON` to the whole file's contents
   (or to its base64: `node -e "console.log(require('fs').readFileSync('key.json').toString('base64'))"`).
   If it is set, the three variables above are not needed. The key is repaired automatically if quotes, spaces or
   `\n` sequences got mixed in while pasting.
4. The frontend and backend must use the same Firebase project, or tokens are rejected as invalid.
5. Redeploy both after changing variables. Every person must press the Push switch again once, because
   tokens from the old project do not work in the new one (old tokens are removed automatically when FCM rejects them).

Web push notes: iPhone needs the site added to the Home Screen first; Pi Browser cannot receive web push.

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
