import { body, param, query, ValidationChain } from "express-validator";
import { LandmarkCategoryEnum } from "../models/enums/LandmarkCategoryEnum";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = Object.values(LandmarkCategoryEnum);
const CATEGORY_MSG     = `Category must be one of: ${VALID_CATEGORIES.join(", ")}.`;

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE FIELD VALIDATORS
// Factory functions — each call returns a fresh chain instance.
// ─────────────────────────────────────────────────────────────────────────────

// ── body ──────────────────────────────────────────────────────────────────────

const nameBody = (): ValidationChain =>
  body("name")
    .trim()
    .notEmpty()            .withMessage("Landmark name is required.")
    .isLength({ min: 2, max: 120 })
                           .withMessage("Name must be between 2 and 120 characters.")
    .escape();

const nameBodyOptional = (): ValidationChain =>
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 120 })
                           .withMessage("Name must be between 2 and 120 characters.")
    .escape();

const categoryBody = (): ValidationChain =>
  body("category")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(VALID_CATEGORIES).withMessage(CATEGORY_MSG);

const latBody = (): ValidationChain =>
  body("lat")
    .notEmpty()            .withMessage("Latitude (lat) is required.")
    .isFloat({ min: -90, max: 90 })
                           .withMessage("lat must be between -90 and 90.")
    .toFloat();

const lngBody = (): ValidationChain =>
  body("lng")
    .notEmpty()            .withMessage("Longitude (lng) is required.")
    .isFloat({ min: -180, max: 180 })
                           .withMessage("lng must be between -180 and 180.")
    .toFloat();

const latBodyOptional = (): ValidationChain =>
  body("lat")
    .optional()
    .isFloat({ min: -90, max: 90 })
                           .withMessage("lat must be between -90 and 90.")
    .toFloat();

const lngBodyOptional = (): ValidationChain =>
  body("lng")
    .optional()
    .isFloat({ min: -180, max: 180 })
                           .withMessage("lng must be between -180 and 180.")
    .toFloat();

// ── params ────────────────────────────────────────────────────────────────────

const mongoIdParam = (name: string): ValidationChain =>
  param(name)
    .isMongoId()           .withMessage(`${name} must be a valid MongoDB ObjectId.`);

// ── cross-field guards ────────────────────────────────────────────────────────

/**
 * On PATCH, lat and lng must both be provided or both omitted.
 * A half-coordinate update produces a corrupt GeoJSON point.
 */
const coordPairCheck = (): ValidationChain =>
  body("lat").custom((lat, { req }) => {
    const lng = (req.body as { lng?: unknown }).lng;
    if (lat !== undefined && lng === undefined)
      throw new Error("lng is required when lat is provided.");
    if (lat === undefined && lng !== undefined)
      throw new Error("lat is required when lng is provided.");
    return true;
  });

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED VALIDATION CHAINS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/landmarks
 *
 * Create a global landmark.  No propertyId — landmarks are not property-specific.
 * lat + lng are the landmark's actual physical location.
 */
export const validateCreateLandmark: ValidationChain[] = [
  nameBody(),
  categoryBody(),
  latBody(),
  lngBody(),
];

/**
 * PATCH /api/landmarks/:landmarkId
 *
 * Crowdsource correction.  All fields optional; lat + lng must appear together.
 */
export const validateUpdateLandmark: ValidationChain[] = [
  mongoIdParam("landmarkId"),
  nameBodyOptional(),
  categoryBody(),
  latBodyOptional(),
  lngBodyOptional(),
  coordPairCheck(),
];

/**
 * GET /api/landmarks/:landmarkId
 * DELETE /api/landmarks/:landmarkId
 * POST /api/landmarks/:landmarkId/verify
 */
export const validateLandmarkId: ValidationChain[] = [
  mongoIdParam("landmarkId"),
];

/**
 * GET /api/landmarks/near?lat=&lng=&radius=&category=&limit=
 *
 * Returns landmarks within `radius` metres of a reference point (the property),
 * sorted nearest-first.  Used by the property map view.
 *
 * - lat / lng:   reference point (property coordinates)
 * - radius:      search radius in metres (50–50 000, default 2 000)
 * - category:    optional filter
 * - limit:       max results (1–50, default 20)
 */
export const validateNearProperty: ValidationChain[] = [
  query("lat")
    .notEmpty()            .withMessage("lat is required.")
    .isFloat({ min: -90, max: 90 })
                           .withMessage("lat must be between -90 and 90.")
    .toFloat(),

  query("lng")
    .notEmpty()            .withMessage("lng is required.")
    .isFloat({ min: -180, max: 180 })
                           .withMessage("lng must be between -180 and 180.")
    .toFloat(),

  query("radius")
    .optional()
    .isInt({ min: 50, max: 50_000 })
                           .withMessage("radius must be an integer between 50 and 50 000 metres.")
    .toInt(),

  query("category")
    .optional()
    .toLowerCase()
    .isIn(VALID_CATEGORIES).withMessage(
      `category must be one of: ${VALID_CATEGORIES.join(", ")}.`
    ),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
                           .withMessage("limit must be an integer between 1 and 50.")
    .toInt(),
];

/**
 * GET /api/landmarks/search?query=&lat=&lng=&radius=&category=&limit=
 *
 * Name-substring + geo search for the "Add Landmark" modal.
 * Surfaced as the user types to prevent duplicate submissions.
 *
 * - query:   partial name (optional — omit to list all nearby)
 * - lat/lng: centre of search (user's map view)
 * - radius:  default 2 000 m
 * - limit:   default 10
 */
export const validateSearch: ValidationChain[] = [
  query("query")
    .optional()
    .trim()
    .isLength({ min: 1, max: 120 })
                           .withMessage("query must be between 1 and 120 characters.")
    .escape(),

  query("lat")
    .notEmpty()            .withMessage("lat is required.")
    .isFloat({ min: -90, max: 90 })
                           .withMessage("lat must be between -90 and 90.")
    .toFloat(),

  query("lng")
    .notEmpty()            .withMessage("lng is required.")
    .isFloat({ min: -180, max: 180 })
                           .withMessage("lng must be between -180 and 180.")
    .toFloat(),

  query("radius")
    .optional()
    .isInt({ min: 50, max: 50_000 })
                           .withMessage("radius must be between 50 and 50 000 metres.")
    .toInt(),

  query("category")
    .optional()
    .toLowerCase()
    .isIn(VALID_CATEGORIES).withMessage(CATEGORY_MSG),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 20 })
                           .withMessage("limit must be between 1 and 20.")
    .toInt(),
];