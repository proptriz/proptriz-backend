import mongoose from "mongoose";

import { env } from "../utils/env";
import logger from "./loggingConfig";

export const connectDB = async () => {
  try {
    // Only log the MongoDB URL in non-production environments
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`Connecting to MongoDB with URL: ${env.MONGODB_URL}`);
    }
    await mongoose.connect(env.MONGODB_URL, {
      serverSelectionTimeoutMS: 15000, // Reduce timeout to prevent long delays
    });
    logger.info("Successful connection to MongoDB.");
  } catch (error) {
    logger.error('Failed connection to MongoDB:', error);
  }
};

const MONGODB_URL = env.MONGODB_URL as string;
if (!MONGODB_URL) {
  throw new Error("⚠️ Please define the MONGODB_URI environment variable inside .env.local");
}

interface Cached {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Use global cache in dev to prevent multiple connections during hot reloads
let cached = (global as any).mongoose as Cached;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URL, {
      bufferCommands: false,
      maxPoolSize: 10, // good for serverless
    }).then((mongoose) => mongoose);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
