import mongoose from "mongoose";

import { env } from "../utils/env";

export const connectDB = async () => {
  try {
    // Only log the MongoDB URL in non-production environments
    if (process.env.NODE_ENV !== 'production') {
      console.info(`Connecting to MongoDB with URL: ${env.MONGODB_URL}`);
    }
    await mongoose.connect(env.MONGODB_URL, {
      serverSelectionTimeoutMS: 15000, // Reduce timeout to prevent long delays
    });
    console.info("Successful connection to MongoDB.");
  } catch (error) {
    console.error('Failed connection to MongoDB:', error);
  }
};