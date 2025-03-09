import { Router } from "express";
import * as reviewController from "../controllers/reviewController";

const reviewRoutes = Router();

reviewRoutes.get("/:uid", reviewController.getUserReviews);
reviewRoutes.get("/:review_id", reviewController.getSingleReview);
reviewRoutes.post("/add", reviewController.addReview);
reviewRoutes.delete("/delete/:review_id", reviewController.deleteUserReview);

export default reviewRoutes;