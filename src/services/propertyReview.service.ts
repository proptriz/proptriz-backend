import mongoose from "mongoose";
import PropertyReviewReply, { PropertyReplyReviewType } from "../models/propertyReplyReview";
import PropertyReview, { PropertyReviewType } from "../models/propertyReview";
import { IUser } from "../types";
import { uploadToCloudinary } from "./misc/image.service";
import { decodeCursor, encodeCursor } from "../helpers/cursor";
import { LeanWithId } from "../helpers/leanWithId";
import { computeRatings } from "../helpers/computeReview";
import User from "../models/user";
import UserSettings from "../models/userSettings";
import Property from "../models/property";
import logger from "../config/loggingConfig";

const PAGE_LIMIT = 20;

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
    let decodedCursor: string | null = null;

    if (cursor) {
      decodedCursor = decodeCursor(cursor);
    }

    const query: any = { property: property_id };

    if (decodedCursor) {
      const [createdAtRaw, idRaw] = decodedCursor.split("_");

      if (
        createdAtRaw &&
        idRaw &&
        mongoose.Types.ObjectId.isValid(idRaw)
      ) {
        query.$or = [
          { createdAt: { $lt: new Date(createdAtRaw) } },
          {
            createdAt: new Date(createdAtRaw),
            _id: { $lt: new mongoose.Types.ObjectId(idRaw) }
          }
        ];
      }
    }

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
      ? encodeCursor(lastReview._id.toString())
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

function buildCursorMatch(cursor?: string) {
  if (!cursor) return {};

  const decoded = decodeCursor(cursor);
  const [createdAtRaw, idRaw] = decoded.split("_");

  if (!createdAtRaw || !mongoose.Types.ObjectId.isValid(idRaw)) {
    return {};
  }

  return {
    $or: [
      { createdAt: { $lt: new Date(createdAtRaw) } },
      {
        createdAt: new Date(createdAtRaw),
        _id: { $lt: new mongoose.Types.ObjectId(idRaw) }
      }
    ]
  };
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
  }).select("_id").lean();

  if (!userSettings) {
    throw new Error("User settings not found");
  }

  const sentMatch = {
    sender: userSettings._id,
    ...buildCursorMatch(sentCursor)
  };

  const receivedMatch = {
    propertyOwner: authUser._id,
    ...buildCursorMatch(receivedCursor)
  };

  const [sent, received] = await Promise.all([
    PropertyReview.aggregate([
      { $match: sentMatch },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          reviews: [
            { $limit: PAGE_LIMIT },
            {
              $lookup: {
                from: "usersettings",
                localField: "sender",
                foreignField: "_id",
                as: "sender",
                pipeline: [{ $project: { username: 1, image: 1 } }]
              }
            },
            { $unwind: "$sender" }
          ],
          totalCount: [{ $count: "count" }]
        }
      }
    ]),

    PropertyReview.aggregate([
      { $match: receivedMatch },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          reviews: [
            { $limit: PAGE_LIMIT },
            {
              $lookup: {
                from: "usersettings",
                localField: "sender",
                foreignField: "_id",
                as: "sender",
                pipeline: [{ $project: { username: 1, image: 1 } }]
              }
            },
            { $unwind: "$sender" }
          ],
          totalCount: [{ $count: "count" }]
        }
      }
    ])
  ]);

  const sentReviews = sent[0]?.reviews ?? [];
  const receivedReviews = received[0]?.reviews ?? [];

  return {
    sent: {
      reviews: sentReviews,
      nextCursor:
        sentReviews.length > 0
          ? encodeCursor(sentReviews.at(-1)!)
          : null,
      totalCount: sent[0]?.totalCount?.[0]?.count ?? 0
    },

    received: {
      reviews: receivedReviews,
      nextCursor:
        receivedReviews.length > 0
          ? encodeCursor(receivedReviews.at(-1)!)
          : null,
      totalCount: received[0]?.totalCount?.[0]?.count ?? 0
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

    let decodedCursor: string | null = null;

    if (cursor) {
      decodedCursor = decodeCursor(cursor);
    }

    const query: any = { review: reviewId };

    if (decodedCursor) {
      const [createdAtRaw, idRaw] = decodedCursor.split("_");

      if (
        createdAtRaw &&
        idRaw &&
        mongoose.Types.ObjectId.isValid(idRaw)
      ) {
        query.$or = [
          { createdAt: { $lt: new Date(createdAtRaw) } },
          {
            createdAt: new Date(createdAtRaw),
            _id: { $lt: new mongoose.Types.ObjectId(idRaw) }
          }
        ];
      }
    }

    const replies = await PropertyReviewReply.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(Math.min(PAGE_LIMIT, 50))
      .populate({
        path: "reply_from",
        select: "username image"
      })
      .lean<LeanWithId<PropertyReplyReviewType>[]>()
      .exec();

    const lastReply = replies[replies.length - 1];

    const nextCursor = lastReply
      ? encodeCursor(lastReply._id.toString())
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

    if (!reviewReply) {
      throw new Error("Error adding new review")
    }

    return reviewReply;
    
  } catch (error: any) {
    throw new Error(`failed to add review for property: ${error.message}`);
  }
};