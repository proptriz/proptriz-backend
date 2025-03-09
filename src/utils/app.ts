import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import homeRoutes from "../routes/home.routes";
import appRouter from "../routes";
import userRoutes from "../routes/user.routes";
import propertyRoutes from "../routes/property.routes";
import reviewRoutes from "../routes/propertyReview.routes";
import agentRoutes from "../routes/agent.routes";
import agentReviewRoutes from "../routes/agentReview.routes";

dotenv.config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors({
    origin: process.env.CORS_ORIGIN_URL,
    credentials: true
}));
app.use(cookieParser());

app.use("/api/v1", appRouter);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/property", propertyRoutes);
app.use("/api/v1/reviews", reviewRoutes);
app.use("/", homeRoutes);
app.use("/api/v1/agent", agentRoutes)
app.use("/api/v1/agent-review", agentReviewRoutes)

export default app