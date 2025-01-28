import mongoose, { Schema, SchemaTypes } from "mongoose";
import { ILandmark } from "../types";
import Property from "./property";

const landmarkSchema = new Schema<ILandmark>(
  {
    property: {
      type: SchemaTypes.ObjectId,
      ref: Property,
      required: true
    },
    title: {
      type: String,
      required: true,
    },
    distance: {
      type: Number,
      required: true,
      default: 0
    },
    position_description: {
      type: String,
      required: false
    },
    image: {
      type: String,
      default: "",
      required: false
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
    created_at: {
      type: Date,
      immutable: true,
      required: true,
      default: () => Date.now(),
    },
    updated_at: {
      type: Date,
      required: true,
      default: () => Date.now(),
    }
  }
);

const Landmark = mongoose.model<ILandmark>("Landmark", landmarkSchema);

export default Landmark;
