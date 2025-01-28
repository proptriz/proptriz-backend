import dotenv from "dotenv"
import app from "./utils/app"
import { env } from "./utils/env";
import { connectDB } from "./config/dbConnection";

dotenv.config();

const startServer = async () => {
  console.info("Initiating server setup...");
  try {
    // Establish connection to MongoDB
    await connectDB();

    // In a non-serverless environment, start the server
    if (env.NODE_ENV !== 'production') {
      await new Promise<void>((resolve) => {
        // Start listening on the specified port
        app.listen(env.PORT, () => {
          console.info(`Server is running on port ${env.PORT}`);
          resolve();
        });
      });
    }

    console.info("Server setup initiated.");
  } catch (error) {
    console.error('Server failed to initialize:', error);
  }
};

// Start the server setup process
startServer();

export default app;
