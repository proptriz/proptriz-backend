import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import homeRoutes from "../routes/home.routes";
import appRouter from "../routes";
import userRoutes from "../routes/user.routes";
import propertyRoutes from "../routes/property.routes";
import propertyReviewRoutes from "../routes/propertyReview.routes";
import paymentsRouter from "../routes/payment.routes";
import requestLogger from "../middlewares/logger";
import settingsRoutes from "../routes/userSettings.routes";
import landmarkRouter from "../routes/landmark.routes";

dotenv.config();

if (!process.env.CORS_ORIGIN_URL) {
  throw new Error("CORS_ORIGIN_URL is not set");
}

const normalize = (u: string) => u.replace(/\/$/, "");

const allowedOrigins = process.env.CORS_ORIGIN_URL!
  .split(",")
  .map(o => normalize(o.trim()));

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(normalize(origin))) {
      return cb(null, true);
    }
    return cb(new Error(`CORS blocked: ${origin}`));
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
app.use("/api/v1/landmarks", landmarkRouter);
app.use("/", homeRoutes);

export default app
