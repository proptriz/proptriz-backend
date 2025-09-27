import dotenv from "dotenv";

dotenv.config();

export const env = {
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV || 'development',
    MONGODB_URI: process.env.MONGODB_URI || '',
    JWT_SECRET: process.env.JWT_SECRET || 'default_secret',
    PI_API_KEY: process.env.PI_API_KEY || '',
    PLATFORM_API_URL: process.env.PLATFORM_API_URL || '',
    WALLET_PRIVATE_SEED: process.env.WALLET_PRIVATE_SEED || '',
    ADMIN_API_USERNAME: process.env.ADMIN_API_USERNAME || '',
    ADMIN_API_PASSWORD: process.env.ADMIN_API_PASSWORD || '',
    UPLOAD_PATH: process.env.UPLOAD_PATH || '',
    DEVELOPMENT_URL: process.env.DEVELOPMENT_URL || '',
    PRODUCTION_URL: process.env.PRODUCTION_URL || '',
    CORS_ORIGIN_URL: process.env.CORS_ORIGIN_URL || '',
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
}