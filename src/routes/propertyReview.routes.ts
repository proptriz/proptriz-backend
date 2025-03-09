import { Router } from "express";
import * as propertyReviewController from "../controllers/PropertyReviewController"
import { isAgentFound } from "../middlewares/isAgentFound";
import { verifyToken } from "../middlewares/verifyToken";

const propertyReviewRoutes = Router();

propertyReviewRoutes.post("/add", verifyToken, isAgentFound, propertyReviewController.addReview);
propertyReviewRoutes.get("/:id", propertyReviewController.getSinglePropertyReview); 
propertyReviewRoutes.get("/all", propertyReviewController.getPropertyAllReviews);

export default propertyReviewRoutes;