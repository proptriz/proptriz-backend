import AgentReview from "../models/agentReview";
import PropertyReview from "../models/propertyReview";
import { IAgentReview, IPropertyReview, IUser } from "../types";

class PropertyReviewService {
  // add a new review
  async addReview(authUser:IUser, propertyId:string, reviewData:IPropertyReview ): Promise<{propertyReview:IPropertyReview, message:string}> {
    try {
      const newReview = new PropertyReview({
        ...reviewData,
        review_giver: authUser._id,
        review_receiver: propertyId,
        comment: reviewData.comment,
        images: reviewData.images,
        rating: reviewData.rating
      });
      const propertyReview = await newReview.save();
      return {propertyReview: propertyReview, message: "Add review for property successfull"}
    } catch (error: any) {
      throw new Error(`failed to add review for property: ${error.message}`);
    }
  }

  // Get a single review by its ID
  async getPropertyReviewById(reviewId:string): Promise<IPropertyReview | null> {
    try {
      return await PropertyReview.findById(reviewId).populate("review_giver").exec();
    } catch (error: any) {
      throw new Error(`Failed to retrieve review with ID ${reviewId}: ${error.message}`);
    }
  }

  // Get a list of reviews belonging to a property
  async getPropertyReviews(propertyId:string): Promise<IPropertyReview[]> {
    try {
      return await PropertyReview.find({property:propertyId}).populate("review_giver").exec();
    } catch (error: any) {
      throw new Error(`Failed to retrieve agent reviews: ${error.message}`);
    }
  }
}

export default new PropertyReviewService();
