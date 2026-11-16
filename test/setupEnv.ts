// Environment for tests only. No real services are contacted.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_API_USERNAME = 'admin';
process.env.ADMIN_API_PASSWORD = 'admin-pass';
process.env.APP_PUBLIC_URL = 'https://proptriz.com';
process.env.JOBS_SECRET = 'job-secret';
