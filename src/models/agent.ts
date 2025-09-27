import mongoose, { Schema, SchemaTypes } from "mongoose";
import { IAgent } from "../types";
import User from "./user";
import { AgentStatusEnum } from "./enums/AgentStatusEnum";

const agentSchema = new Schema<IAgent>(
  {
    user: {
      type: SchemaTypes.ObjectId,
      ref: User,
      required: true
    },
    image: {
      type: String,
      required: true,
      default: ""
    },
    brand_name: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
      default: ""
    },
    map_location: {
      type: {
        type: String,
        enum: ['Point'],
        required: false,
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
        default: [0, 0]
      },
    },
    status: {
      type: String,
      enum: AgentStatusEnum,
      required: true,
      default: AgentStatusEnum.available
    },
    social_handles: {
      type: Map,
      of: String,
      required:false
    }
  }, { timestamps: true }
);

const Agent = mongoose.model<IAgent>("Agent", agentSchema);

export default Agent;
