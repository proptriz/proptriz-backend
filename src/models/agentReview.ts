import mongoose, { Schema, SchemaTypes } from "mongoose";
import { IAgentReview } from "../types";
import User from "./user";
import Agent from "./agent";
import { RatingScale } from "./enums/ratingScale";

const agentReviewSchema = new Schema<IAgentReview>(
  {
    review_giver: {
      type: SchemaTypes.ObjectId,
      ref: User,
      required: true
    },
    review_receiver: {
      type: SchemaTypes.ObjectId,
      ref: Agent,
      required: true
    },
    images: {
      type: [String],
      default: [""],
      required: false
    },
    rating: {
      type: Number,
      enum: Object.values(RatingScale).filter(value => typeof value === 'number'),
      required: true,
    },
    comment: {
      type: String,
      required: false,
      default: ""
    },
    reply_review_id: {
      type: SchemaTypes.ObjectId,
      required: false,
      default: ""
    }
  }, { timestamps: true }
);

const AgentReview = mongoose.model<IAgentReview>("AgentReview", agentReviewSchema);

export default AgentReview;
