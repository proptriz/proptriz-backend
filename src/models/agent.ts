import mongoose, { Schema, SchemaTypes } from "mongoose";
import { IAgent } from "../types";
import User from "./user";
import { AgentStatus } from "./enums/agentStatus";

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
      enum: AgentStatus,
      required: true,
      default: AgentStatus.available
    },
    beacame_agent_date: {
      type: Date,
      immutable: true,
      required: true,
      default: () => Date.now(),
    },
    modified_at: {
      type: Date,
      required: true,
      default: () => Date.now(),
    },
    social_handles: {
      type: Map,
      of: String,
      required:false
    }
  }
);

const Agent = mongoose.model<IAgent>("Agent", agentSchema);

export default Agent;
