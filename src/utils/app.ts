import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import homeRoutes from "../routes/home.routes";
import appRouter from "../routes";
import userRoutes from "../routes/user.routes";
import propertyRoutes from "../routes/property.routes";
import propertyReviewRoutes from "../routes/propertyReview.routes";
import agentRoutes from "../routes/agent.routes";
import agentReviewRoutes from "../routes/agentReview.routes";
import paymentsRouter from "../routes/payment.routes";
import requestLogger from "../middlewares/logger";
import settingsRoutes from "../routes/userSettings.routes";
import { env } from "./env";

dotenv.config();

if (env.CORS_ORIGIN_URL) {
  throw new Error("CORS_ORIGIN_URL is not set");
}

const allowedOrigins = env.CORS_ORIGIN_URL
  ?.split(",")
  .map(origin => origin.trim());

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors({
    origin: (origin, callback) => {
    // allow non-browser requests (no origin header)
    if (!origin) return callback(null, true);  

    if (allowedOrigins?.includes(origin)) {
      return callback(null, true);
    }  

    return callback(new Error(`CORS blocked: ${origin} not allowed`));
  },
  credentials: true
}));
app.use(cookieParser());
app.use(requestLogger);

app.use("/api/v1", appRouter);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/settings", settingsRoutes); 
app.use('/api/v1/payments', paymentsRouter);
app.use("/api/v1/property", propertyRoutes);
app.use("/api/v1/property-review", propertyReviewRoutes);
app.use("/", homeRoutes);
app.use("/api/v1/agent", agentRoutes);
app.use("/api/v1/agent-review", agentReviewRoutes); 

export default app