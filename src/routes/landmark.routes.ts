import { Router } from "express";
import * as landmarkController from "../controllers/landmarkController";
import * as landmarkValidation from "../validations/landmark.validation";
import { verifyToken } from "../middlewares/verifyToken";

const landmarkRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE ORDERING
//
// Static segments ("/near", "/search") must be declared BEFORE parameterised
// routes ("/:landmarkId") so Express does not treat the literal strings as ids.
// ─────────────────────────────────────────────────────────────────────────────

// ── Public ────────────────────────────────────────────────────────────────────

/**
 * GET /api/landmarks/near?lat=&lng=&radius=&category=&limit=
 *
 * Landmarks near a reference point (property coordinates), sorted by distance.
 * Primary endpoint for the property map view — fetches the POI pins.
 */
landmarkRouter.get("/near", landmarkValidation.validateNearProperty, landmarkController.getNearLandmarks);

/**
 * GET /api/landmarks/search?query=&lat=&lng=&radius=&category=&limit=
 *
 * Name-substring + geo search.  Used by the "Add Landmark" modal to surface
 * existing entries as the user types, preventing duplicate submissions.
 */
landmarkRouter.get("/search", landmarkValidation.validateSearch, landmarkController.searchLandmarks);

/**
 * GET /api/landmarks/:landmarkId
 *
 * Fetch a single landmark by id.
 */
landmarkRouter.get("/:landmarkId", landmarkValidation.validateLandmarkId, landmarkController.getLandmark);

// ── Protected — any authenticated user ───────────────────────────────────────

/**
 * POST /api/landmarks
 *
 * Create a new global landmark.  Any authenticated user may create.
 * The service performs a 100 m deduplication check before inserting.
 */
landmarkRouter.post("/", verifyToken, landmarkValidation.validateCreateLandmark, landmarkController.createLandmark);

/**
 * POST /api/landmarks/:landmarkId/verify
 *
 * Confirm a landmark is correctly placed.  Increments verifiedCount.
 * Any authenticated user may verify.
 * Must be declared before PATCH /:landmarkId to avoid route shadowing.
 */
landmarkRouter.post("/:landmarkId/verify", verifyToken, landmarkValidation.validateLandmarkId, landmarkController.verifyLandmark);

/**
 * PATCH /api/landmarks/:landmarkId
 *
 * Crowdsource correction — any authenticated user may update.
 * Admins bypass the location-lock on high-verifiedCount landmarks.
 */
landmarkRouter.patch("/:landmarkId", verifyToken, landmarkValidation.validateUpdateLandmark, landmarkController.updateLandmark);

/**
 * DELETE /api/landmarks/:landmarkId
 *
 * Admin: unconditional delete.
 * Creator: may delete within 1 hour of creation.
 * Others: 403.
 */
landmarkRouter.delete("/:landmarkId", verifyToken, landmarkValidation.validateLandmarkId, landmarkController.deleteLandmark);

export default landmarkRouter;