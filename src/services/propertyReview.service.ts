import mongoose from "mongoose";
import PropertyReviewReply, { PropertyReplyReviewType } from "../models/propertyReplyReview";
import PropertyReview, { PropertyReviewType } from "../models/propertyReview";
import { IUser } from "../types";
import { uploadToCloudinary } from "./misc/image.service";
import { decodeCursor, encodeCursor } from "../helpers/cursor";
import { LeanWithId } from "../helpers/leanWithId";
import { computeRatings } from "../helpers/computeReview";
import UserSettings from "../models/userSettings";
import Property from "../models/property";
import logger from "../config/loggingConfig";
import paginateWithCursor from "../helpers/paginateWithCursor";

const PAGE_LIMIT = 10;

// add a new review
export async function addReview(
  authUser:IUser, 
  reviewData:PropertyReviewType,
  file?: Express.Multer.File
): Promise<PropertyReviewType> {
  try {
    
    // Upload new image if file exist
    if (file) {
      const url = await uploadToCloudinary(
        file.buffer,
        `propTriz/review`,
        `${authUser.username}`
      );
      reviewData.image = url;
    }

    const userSettings = await UserSettings.findOne({ user: authUser._id }).exec();
    if (!userSettings) {
      throw new Error("User settings not found for the authenticated user");
    }

    const property = await Property.findOne({property: reviewData.property}).exec();
    if (!property) {
      throw new Error("Property no found ")
    }

    if (property.user !== userSettings._id) {
      throw new Error("You can't rate your own property")
    }

    const newReview = new PropertyReview({
      ...reviewData,
      sender: userSettings._id,
      property: reviewData.property,
      comment: reviewData.comment,
      image: reviewData.image,
      rating: reviewData.rating
    });

    const propertyReview = await newReview.save();

    if (!propertyReview._id) {
      throw new Error("Error adding new review")
    }

    await computeRatings(reviewData.property.toString());
    return propertyReview;
    
  } catch (error: any) {
    throw new Error(`failed to add review for property: ${error.message}`);
  }
};

// Get a single review by its ID
export async function getReviewById(reviewId: string, page: number): Promise<{review: PropertyReviewType, replies: PropertyReplyReviewType[]} | null> {
  try {
    const safePage = Math.max(0, Number(page) || 0);
    const skip = safePage * PAGE_LIMIT;

    // Fetch review (lean + controlled populate)
    const review = await PropertyReview.findById(reviewId)
      .populate({
        path: "sender",
        select: "username image"
      })
      .lean<PropertyReviewType>()
      .exec();

    if (!review) {
      throw new Error("No review is found with id: ")
    };

    // Fetch replies (paginated, indexed, lean)
    const replies = await PropertyReviewReply.find({ review: reviewId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PAGE_LIMIT)
      .populate({
        path: "reply_from",
        select: "username image"
      })
      .lean<PropertyReplyReviewType[]>()
      .exec();

    return {
      review, 
      replies
    }
  } catch (error) {
    // Preserve original error context
    throw new Error(
      `getPropertyReviewById failed for reviewId=${reviewId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

type GetReviewResult = {
  reviews: LeanWithId<PropertyReviewType>[];
  nextCursor: string | null;
};

export async function getPropertyReviews(property_id: string, cursor: string | undefined): Promise<GetReviewResult> {
  try {

    const query: any = { 
      property: property_id,
      ...decodeCursor(cursor) 
    };

    // Fetch review (lean + controlled populate)
    const reviews = await PropertyReview.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(Math.min(PAGE_LIMIT, 50))
      .populate({
        path: "sender",
        select: "username image"
      })
      .populate({
        path: "property",
        select: "title address banner average_rating"
      })
      .lean<LeanWithId<PropertyReviewType>[]>()
      .exec();

    const lastReview = reviews[reviews.length - 1];

    const nextCursor = lastReview
      ? encodeCursor({createdAt: lastReview.createdAt, _id: lastReview._id})
      : null;

    return {
      reviews,
      nextCursor
    };

  } catch (error) {
    // Preserve original error context
    throw new Error(
      `Failed to get reviews for property id=${property_id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

type LeanReview = LeanWithId<PropertyReviewType> & {
  sender: {
    username: string;
    image: string;
  };
};

type GetUserReviewsResult = {
  sent: {
    reviews: LeanReview[];
    nextCursor: string | null;
    totalCount: number;
  };
  received: {
    reviews: LeanReview[];
    nextCursor: string | null;
    totalCount: number;
  };
};

export async function getUserReviews(
  authUser: IUser,
  sentCursor?: string,
  receivedCursor?: string
): Promise<GetUserReviewsResult> {
  const userSettings = await UserSettings.findOne({
    user: authUser._id
  })
    .select("_id")
    .lean();

  if (!userSettings) {
    throw new Error("User settings not found");
  }

  const sentMatch = {
    sender: userSettings._id,
    ...decodeCursor(sentCursor)
  };

  const receivedMatch = {
    ...decodeCursor(receivedCursor)
  };

  const [sentReviews, receivedReviews] = await Promise.all([
    // ---------------- SENT REVIEWS ----------------
    PropertyReview.aggregate([
      { $match: sentMatch },

      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: PAGE_LIMIT + 1 },

      {
        $lookup: {
          from: "properties",
          localField: "property",
          foreignField: "_id",
          as: "property",
          pipeline: [
            { $project: { title: 1, banner: 1, address: 1, average_rating: 1, user: 1 } }
          ]
        }
      },
      { $unwind: "$property" },

      {
        $lookup: {
          from: "user-settings",
          localField: "sender",
          foreignField: "_id",
          as: "sender",
          pipeline: [{ $project: { username: 1, image: 1 } }]
        }
      },
      { $unwind: "$sender" }
    ]),

    // ---------------- RECEIVED REVIEWS ----------------
    PropertyReview.aggregate([
      {
        $lookup: {
          from: "properties",
          localField: "property",
          foreignField: "_id",
          as: "property",
          pipeline: [
            {
              $match: { user: authUser._id }
            },
            { $project: { title: 1, banner: 1, address: 1, average_rating: 1, user: 1 } }
          ]
        }
      },
      { $unwind: "$property" },

      { $match: receivedMatch },

      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: PAGE_LIMIT + 1 },

      {
        $lookup: {
          from: "user-settings",
          localField: "sender",
          foreignField: "_id",
          as: "sender",
          pipeline: [{ $project: { username: 1, image: 1 } }]
        }
      },
      { $unwind: "$sender" }
    ])
  ]);

  // ---------------- COUNTS ----------------

  const sentTotalCount = !sentCursor
    ? await PropertyReview.countDocuments({ sender: userSettings._id })
    : null;

  let receivedTotalCount = null;

  if (!receivedCursor) {
    const ownedPropertyIds = await Property.find(
      { user: authUser._id },
      { _id: 1 }
    ).lean();

    receivedTotalCount = await PropertyReview.countDocuments({
      property: { $in: ownedPropertyIds.map(p => p._id) }
    });
  }

  const sentPage = paginateWithCursor(sentReviews, PAGE_LIMIT);
  const receivedPage = paginateWithCursor(receivedReviews, PAGE_LIMIT);

  return {
    sent: {
      reviews: sentPage.page,
      nextCursor: sentPage.nextCursor,
      totalCount: sentTotalCount ?? 0
    },

    received: {
      reviews: receivedPage.page,
      nextCursor:receivedPage.nextCursor,
      totalCount: receivedTotalCount ?? 0
    }
  };
}

type GetRepliesResult = {
  replies: PropertyReplyReviewType[];
  nextCursor: string | null;
};

export async function getReplies(
  reviewId: string,
  cursor?: string
): Promise<GetRepliesResult> {
  try {
    // check if id is valid
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      throw new Error("Invalid review ID");
    }

    const query = { 
      review: reviewId,
      ...decodeCursor(cursor) 
    };

    const replies = await PropertyReviewReply.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(Math.min(PAGE_LIMIT, 20))
      .populate({
        path: "reply_from",
        select: "username image"
      })
      .lean<LeanWithId<PropertyReplyReviewType>[]>()
      .exec();

    const lastReply = replies[replies.length - 1];

    const nextCursor = lastReply
      ? encodeCursor({createdAt: lastReply.createdAt, _id: lastReply._id})
      : null;

    return {
      replies,
      nextCursor
    };
    
  } catch (error) {
    throw new Error(
      `getReplies cursor pagination failed for reviewId=${reviewId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}


// add a new review
export async function addReply(
  authUser: IUser, 
  replyData: PropertyReplyReviewType,
): Promise<PropertyReplyReviewType> {
  try {
    logger.info("Adding reply to review:", {replyData});

    const userSettings = await UserSettings.findOne({ user: authUser._id }).exec();
    if (!userSettings) {
      logger.error("User settings not found for the authenticated user");
      throw new Error("User settings not found for the authenticated user");
    }

    const newReply = new PropertyReviewReply({
      reply_from: userSettings._id,
      review: replyData.review,
      comment: replyData.comment,
      seen_by: []
    });

    const reviewReply = await newReply.save();

    // Update reply count in PropertyReview
    await PropertyReview.findByIdAndUpdate(
      replyData.review,
      { $inc: { reply_count: 1 } }
    ).exec();

    if (!reviewReply) {
      throw new Error("Error adding new review")
    }

    return reviewReply;
    
  } catch (error: any) {
    throw new Error(`failed to add review for property: ${error.message}`);
  }
};