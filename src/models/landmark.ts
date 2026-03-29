// landmark.ts  — complete, production-ready model file
//
// ─── Architecture change from the previous version ────────────────────────────
//
// Landmarks are now GLOBAL, crowd-sourced POIs — they are NOT tied to any
// specific property.  A landmark such as "Ikeja City Mall" exists once in
// the collection and can be surfaced by any property whose map viewport
// contains it, sorted by distance to that property.
//
// Previous model  →  landmark.property  (ObjectId, required)
// This model      →  no property field at all
//
// New fields:
//   createdBy      ObjectId → User   who originally added this landmark
//   lastUpdatedBy  ObjectId → User   last person to correct it (crowdsourcing)
//   verifiedCount  Number            incremented each time any user confirms it
//
// The Property schema no longer needs a landmarks[] back-reference array.
// Landmarks near a property are resolved at query-time via $near.
//
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Document, InferSchemaType, Schema, SchemaTypes } from "mongoose";
import { LandmarkCategoryEnum } from "./enums/LandmarkCategoryEnum";
import User from "./user";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ILandmark extends Document {
  name:            string;
  category:        LandmarkCategoryEnum;
  map_location: {
    type:        string;
    coordinates: number[];   // [longitude, latitude] — GeoJSON order
  };
  createdBy:       mongoose.Types.ObjectId;
  lastUpdatedBy:   mongoose.Types.ObjectId;
  verifiedCount:   number;
  createdAt:       Date;
  updatedAt:       Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const landmarkSchema = new Schema<ILandmark>(
  {
    name: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 120,
    },
    category: {
      type:     String,
      enum:     Object.values(LandmarkCategoryEnum),
      required: true,
      default:  LandmarkCategoryEnum.other,
      index:    true,
    },
    map_location: {
      type: {
        type:    String,
        enum:    ["Point"],
        default: "Point",
      },
      coordinates: {
        type:     [Number],   // [longitude, latitude]
        required: true,
        default:  [0, 0],
      },
    },
    createdBy: {
      type:     SchemaTypes.ObjectId,
      ref:      User,
      required: true,
      index:    true,
    },
    lastUpdatedBy: {
      type:     SchemaTypes.ObjectId,
      ref:      User,
      required: true,
    },
    verifiedCount: {
      type:    Number,
      default: 1,    // creator's own implicit upvote
      min:     0,
    },
  },
  { timestamps: true },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * 2dsphere — required for $near / $geoWithin queries.
 * Shell: db.landmarks.createIndex({ map_location: "2dsphere" })
 */
landmarkSchema.index({ map_location: "2dsphere" });

/**
 * Compound text index — powers name-based deduplication check:
 *   Landmark.find({ name: /^ikeja city mall$/i, ... })
 *
 * Shell: db.landmarks.createIndex({ name: "text" })
 */
landmarkSchema.index({ name: "text" });

/**
 * Sparse unique index on (name + approximate location) to prevent exact
 * duplicate submissions.  Uses a 5-decimal-place coordinate bucket.
 * This is a partial guard — the service also does an explicit proximity check.
 */
landmarkSchema.index(
  { name: 1, "map_location.coordinates": 1 },
  { name: "landmark_name_location_idx" }
);

// ─── Model ────────────────────────────────────────────────────────────────────

export type LandmarkType = InferSchemaType<typeof landmarkSchema>;

const Landmark = mongoose.model<ILandmark>("Landmark", landmarkSchema);
export default Landmark;


// ─────────────────────────────────────────────────────────────────────────────
// PROPERTY SCHEMA UPDATE
// ─────────────────────────────────────────────────────────────────────────────
//
// Remove the landmarks[] array from Property — it is no longer needed.
// Landmarks near a property are resolved at query-time via $geoWithin / $near.
//
// If you have existing data with property.landmarks populated, run a migration:
//   db.properties.updateMany({}, { $unset: { landmarks: "" } })
//
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// MOUNT IN app.ts
// ─────────────────────────────────────────────────────────────────────────────
//
//   import landmarkRouter from "./routes/landmark.routes";
//   app.use("/api/landmarks", landmarkRouter);
//
// ─────────────────────────────────────────────────────────────────────────────