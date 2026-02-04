import { Request, Response } from "express";
import { IUser } from "../types";
import * as PropertyReviewService from "../services/propertyReview.service";
import logger from "../config/loggingConfig";
import { PropertyReviewType } from "../models/propertyReview";
import { PropertyReplyReviewType } from "../models/propertyReplyReview";

// get review by ID
export const getSingleReview = async (req: Request, res: Response) => {
  try {
    logger.info("Fetching a review by Id");
    const reviewId = req.params.review_id as string;
    const page = req.query.page;

    const newPage = parseInt(page as string, 10) || 1;

    const review = await PropertyReviewService.getReviewById(reviewId, newPage);

    if (!review?.review) {
      return res.status(401).json({ success: false, message:"No review found" })
    }

    logger.info("Single Review fetched successfully:", review);
    return res.status(200).json(review);

  } catch (error: any) {
    logger.error("Error fetching review:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}

// Get reviews by property ID
export const getPropertyReviews = async (req: Request, res: Response) => {
  try {
    // logger.info("Fetching review with ID:", req.params.id);
    const property_id = req.query.property_id as string;
    const cursor = req.query.cursor? req.query.cursor as string : undefined;

    const reviews = await PropertyReviewService.getPropertyReviews(property_id, cursor);
    logger.info("Property all reviews fetched successfully:");
    res.status(200).json( reviews );

  } catch (error: any) {
    logger.error("Error fetching property all reviews by ID:", error.message);
    res.status(404).json({ success: false, message: error.message });
  }
}

export const addReview = async (req:Request, res:Response) => {
  try {
    const currentUser = req.currentUser as IUser;

    const file = req.file as Express.Multer.File | undefined;
    const {property_id, rating, comment} = req.body;

    const reviewData = {
      property: property_id,
      rating: Number(rating),
      comment
    } as PropertyReviewType;

    const result = await PropertyReviewService.addReview(currentUser, reviewData, file)
    logger.info("review data:", {result});
    
    return res.status(200).json(result)

  } catch (error:any){
    logger.error("add review for property error: ", error.message)
    return res.status(400).json({message: "error giving review to property"})
  }
}

export const getUserReviews = async (req: Request, res: Response) => {
  try {
    logger.info("Fetching user reviews");
    const currentUser = req.currentUser as IUser;
    const sentCursor = req.query.sent_cursor? req.query.sent_cursor as string : undefined;
    const receivedCursor = req.query.received_cursor? req.query.received_cursor as string : undefined;

    const reviews = await PropertyReviewService.getUserReviews(currentUser, sentCursor, receivedCursor);
    logger.info("User reviews fetched successfully:");
    
    res.status(200).json( reviews );
  } catch (error: any) {
    logger.error("Error fetching user reviews:", error);
    res.status(404).json({ success: false, message: error.message });
  }
}

export const getReplies = async (req:Request, res: Response) => {
  try {
    const {review_id, cursor} = req.query as any;

    const reviewId = review_id as string;
    const {replies, nextCursor} = await PropertyReviewService.getReplies(reviewId, cursor);

    return res.status(200).json({replies, cursor: nextCursor })
    
  } catch (error:any) {
    logger.error("controller error geting replies")
    return res.status(500).json({error: "Error getting replies"})
  }
}

export const addReply = async (req:Request, res:Response) => {
  try {
    const currentUser = req.currentUser as IUser;
    const {review_id, comment} = req.body;

    const replyData = {
      review: review_id,
      comment
    } as PropertyReplyReviewType;

    const result = await PropertyReviewService.addReply(currentUser, replyData);

    logger.info(result);
    return res.status(200).json(result);

  } catch (error:any){
    logger.error("add reply to review error: ", error.message)
    return res.status(400).json({message: "error giving reply to review"})
  }
}
