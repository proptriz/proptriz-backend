import { Router } from "express";
import * as PropertyReviewController from "../controllers/propertyReviewController"
import { isAgentFound } from "../middlewares/isAgentFound";
import { verifyToken } from "../middlewares/verifyToken";

const propertyReviewRoutes = Router();

propertyReviewRoutes.post("/add", verifyToken, isAgentFound, PropertyReviewController.addReview);
propertyReviewRoutes.get("/:id", PropertyReviewController.getSinglePropertyReview); 
propertyReviewRoutes.get("/all", PropertyReviewController.getPropertyAllReviews);

export default propertyReviewRoutes;