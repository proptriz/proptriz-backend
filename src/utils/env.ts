import dotenv from "dotenv";

dotenv.config();

export const env = {
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV || 'development',
    MONGODB_URL: process.env.MONGODB_URL || '',
    JWT_SECRET: process.env.JWT_SECRET || 'default_secret',
    DEVELOPMENT_URL: process.env.DEVELOPMENT_URL || '',
    PRODUCTION_URL: process.env.PRODUCTION_URL || '',
    CORS_ORIGIN_URL: process.env.CORS_ORIGIN_URL || '',
}