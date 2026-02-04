import { Router } from "express";
import * as PropertyReviewController from "../controllers/propertyReviewController"
import { verifyToken } from "../middlewares/verifyToken";
import { replyValidations, reviewValidations } from "../middlewares/validation";
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
  "/single/:review_id", 
  reviewValidations.getPropertyReview,
  PropertyReviewController.getSingleReview
);

propertyReviewRoutes.get(
  "/user/review", 
  verifyToken,
  PropertyReviewController.getUserReviews
);

propertyReviewRoutes.post(
  "/reply/add", 
  verifyToken, 
  replyValidations.add,
  PropertyReviewController.addReply
);

propertyReviewRoutes.get(
  "/reply",
  reviewValidations.getPropertyReview,
  PropertyReviewController.getReplies
);

export default propertyReviewRoutes;