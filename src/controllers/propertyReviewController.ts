import { Request, Response } from "express";
import AgentService from "../services/agent.service";
import { IAgent, IUser } from "../types";
import PropertyReviewService from "../services/propertyReview.service";


export const getPropertyAllReviews = async (req: Request, res: Response) => {
  try {
    console.log("Fetching all reviews for agent ");
    const agentId = req.body;
    const reviews = await PropertyReviewService.getPropertyReviews(agentId);
    if (reviews.length<1) {
      return res.status(401).json({ reviews:null, message:"No review for agent" })
    }
    console.log("Property reviews fetched successfully:", reviews);
    return res.status(200).json( reviews );
  } catch (error: any) {
    console.error("Error fetching all property reviews:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}

// Get a review by ID
export const getSinglePropertyReview = async (req: Request, res: Response) => {
  try {
    console.log("Fetching review with ID:", req.params.id);
    const reviewId = req.params.id;
    const review = await PropertyReviewService.getPropertyReviewById(reviewId);
    console.log("Property review fetched successfully:", review);
    res.status(200).json( review );
  } catch (error: any) {
    console.error("Error fetching property review by ID:", error.message);
    res.status(404).json({ success: false, message: error.message });
  }
}

export const addReview = async (req:Request, res:Response) => {
  try {
    const currentUser = req.currentUser as IUser;
    const {propertyId, reviewData} = req.body;
    const result = await PropertyReviewService.addReview(currentUser, propertyId, reviewData)
    console.info(result)
    return res.status(200).json(result)
  } catch (error:any){
    console.error("add review for property error: ", error.message)
    return res.status(400).json({message: "error giving review to property"})
  }
}
