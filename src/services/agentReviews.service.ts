import AgentReview from "../models/agentReview";
import { IAgentReview, IUser } from "../types";

class AgentReviewService {
  // register a new agent
  async addReview(authUser:IUser, agentId:string, reviewData:IAgentReview ): Promise<{agentReview:IAgentReview, message:string}> {
    try {
      const newReview = new AgentReview({
        ...reviewData,
        review_giver: authUser._id,
        review_receiver: agentId,
        comment: reviewData.comment,
        images: reviewData.images,
        rating: reviewData.rating
      });
      const agentReview = await newReview.save();
      return {agentReview: agentReview, message: "Add review for agent successfull"}
    } catch (error: any) {
      throw new Error(`failed to add review for agent: ${error.message}`);
    }
  }

  // Get a single review by its ID
  async getAgentReviewById(reviewId:string): Promise<IAgentReview | null> {
    try {
      return await AgentReview.findById(reviewId).populate("review_giver", "review_receiver").exec();
    } catch (error: any) {
      throw new Error(`Failed to retrieve review with ID ${reviewId}: ${error.message}`);
    }
  }

  // Get a list of reviews belonging to an agent
  async getAgentReviews(agentId:string): Promise<IAgentReview[]> {
    try {
      return await AgentReview.find({review_receiver:agentId}).populate("review_giver").exec();
    } catch (error: any) {
      throw new Error(`Failed to retrieve agent reviews: ${error.message}`);
    }
  }
}

export default new AgentReviewService();
