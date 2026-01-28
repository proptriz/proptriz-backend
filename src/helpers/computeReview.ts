import mongoose from "mongoose";
import Property from "../models/property";
import PropertyReview from "../models/propertyReview";
import { RatingScaleEnum } from "../models/enums/RatingScaleEnum";

export const computeRatings = async (propertyId: string): Promise<number> => {
  try {
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      throw new Error("Invalid propertyId");
    }

    const propertyObjectId = new mongoose.Types.ObjectId(propertyId);

    const stats = await PropertyReview.aggregate<{
      totalReviews: number;
      avgRating: number;
    }>([
      {
        $match: {
          property: propertyObjectId
        }
      },
      {
        $match: {
          rating: {
            $in: Object.values(RatingScaleEnum).filter(
              (v) => typeof v === "number"
            )
          }
        }
      },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          avgRating: { $avg: "$rating" }
        }
      }
    ]);

    const totalReviews = stats[0]?.totalReviews ?? 0;

    // If no reviews, keep it neutral (or set null if you prefer)
    const averageRating =
      totalReviews === 0 ? 4.5 : Number((stats[0].avgRating ?? 4.5).toFixed(1));

    await Property.updateOne(
      { _id: propertyObjectId },
      { $set: { average_rating: averageRating, review_count: totalReviews } }
    ).exec();

    return averageRating;
  } catch (error: any) {
    throw new Error(
      `Failed to compute ratings for propertyId=${propertyId}: ${error?.message || error}`
    );
  }
};
