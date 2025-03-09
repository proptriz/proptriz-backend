import { Request, Response } from "express";
import AgentService from "../services/agent.service";
import { IAgent, IUser } from "../types";
import agentReviewsService from "../services/agentReviews.service";


export const getAgentAllReviews = async (req: Request, res: Response) => {
  try {
    console.log("Fetching all reviews for agent ");
    const agentId = req.body;
    const reviews = await agentReviewsService.getAgentReviews(agentId);
    if (reviews.length<1) {
      return res.status(401).json({ reviews:null, message:"No review for agent" })
    }
    console.log("Agents reviews fetched successfully:", reviews);
    res.status(200).json( reviews );
  } catch (error: any) {
    console.error("Error fetching all properties:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

// Get a review by ID
export const getSingleAgentReview = async (req: Request, res: Response) => {
  try {
    console.log("Fetching review with ID:", req.params.id);
    const reviewId = req.params.id;
    const review = await agentReviewsService.getAgentReviewById(reviewId);
    console.log("Agent review fetched successfully:", review);
    res.status(200).json( review );
  } catch (error: any) {
    console.error("Error fetching agent review by ID:", error.message);
    res.status(404).json({ success: false, message: error.message });
  }
}

export const addReview = async (req:Request, res:Response) => {
  try {
    const currentUser = req.currentUser as IUser;
    const {agentId, reviewData} = req.body;
    const result = await agentReviewsService.addReview(currentUser, agentId, reviewData)
    console.info(result)
    return res.status(200).json(result)
  } catch (error:any){
    console.error("add review for agent error: ", error.message)
    return res.status(400).json({message: "error giving review to agent"})
  }
}
