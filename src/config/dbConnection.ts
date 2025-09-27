import mongoose from "mongoose";

import { env } from "../utils/env";
import logger from "./loggingConfig";

export const connectDB = async () => {
  try {
    // Only log the MongoDB URL in non-production environments
    if (env.NODE_ENV !== 'production') {
      logger.info(`Connecting to MongoDB with URL: ${env.MONGODB_URL}`);
    }
    await mongoose.connect(env.MONGODB_URL);
    logger.info("Successful connection to MongoDB.");
  } catch (error) {
    logger.error('Failed connection to MongoDB:', error);
  }
};
