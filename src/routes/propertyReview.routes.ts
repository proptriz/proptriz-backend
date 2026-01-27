import { Router } from "express";
import * as PropertyReviewController from "../controllers/propertyReviewController"
import { verifyToken } from "../middlewares/verifyToken";
import { reviewValidations } from "../middlewares/validation";
import upload from "../utils/multer";

const propertyReviewRoutes = Router();

propertyReviewRoutes.post(
  "/add", 
  verifyToken, 
  upload.single('image'),
  reviewValidations.add,
  PropertyReviewController.addReview
);

propertyReviewRoutes.get(
  "/property", 
  reviewValidations.getPropertyReview,
  PropertyReviewController.getPropertyReviews
);

propertyReviewRoutes.get(
  "/:review_id", 
  reviewValidations.getPropertyReview,
  PropertyReviewController.getSingleReview
);

export default propertyReviewRoutes;