import { Request, Response, NextFunction } from "express";
import { matchedData, validationResult } from "express-validator";
import { landmarkService } from "../services/landmark.service";
import { LandmarkCategoryEnum } from "../models/enums/LandmarkCategoryEnum";
import { IUser } from "../types";
import logger from "../config/loggingConfig";

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Run express-validator; respond 422 and return true when validation fails. */
function rejectIfInvalid(req: Request, res: Response): boolean {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    res.status(422).json({
      success: false,
      message: "Validation failed.",
      errors:  result.array().map(e => ({
        field:   (e as any).path ?? (e as any).param ?? "unknown",
        message: e.msg,
      })),
    });
    return true;
  }
  return false;
}

/** Map a service-layer tagged Error → HTTP status.  Unexpected errors → 500. */
function statusFrom(err: unknown): number {
  if (err instanceof Error && "status" in err) {
    const s = (err as any).status as number;
    if ([400, 401, 403, 404, 409, 422].includes(s)) return s;
  }
  return 500;
}

/** Send a consistent error response; log unexpected 500s. */
function fail(res: Response, err: unknown): void {
  const status  = statusFrom(err);
  const message = err instanceof Error ? err.message : "An unexpected error occurred.";
  if (status === 500) logger.error("[LandmarkController] Unexpected error:", err);
  res.status(status).json({ success: false, message });
}

/**
 * Read the authenticated user attached by verifyToken middleware.
 * Returns null and sends 401 when the user is missing.
 *
 * Uses req.currentUser (set by your verifyToken middleware).
 */
function currentUser(req: Request, res: Response): IUser | null {
  const user = req.currentUser ?? null;
  if (!user) {
    res.status(401).json({ success: false, message: "Authentication required." });
  }
  return user;
}

/**
 * Returns true when the authenticated user is an admin.
 * Adjust the role/flag field to match your IUser type.
 * Common patterns: user.role === "admin" | user.isAdmin === true
 */
function isAdmin(user: IUser): boolean {
  return (user as any).role === "admin" || (user as any).isAdmin === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPED matchedData INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

interface CreateBody {
  name:      string;
  category?: LandmarkCategoryEnum;
  lat:       number;
  lng:       number;
}

interface UpdateBody {
  name?:     string;
  category?: LandmarkCategoryEnum;
  lat?:      number;
  lng?:      number;
}

interface NearQuery {
  lat:       number;
  lng:       number;
  radius?:   number;
  category?: LandmarkCategoryEnum;
  limit?:    number;
}

interface SearchQuery extends NearQuery {
  query?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/landmarks
 *
 * Create a global landmark.  Any authenticated user may create.
 * No propertyId required — landmarks are not property-specific.
 *
 * Body   : { name, category?, lat, lng }
 * Returns: 201 { success: true, data: LandmarkResponse }
 */
export async function createLandmark(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  if (rejectIfInvalid(req, res)) return;

  const user = currentUser(req, res);
  if (!user) return;

  try {
    const { name, category, lat, lng } =
      matchedData<CreateBody>(req, { locations: ["body"] });

    const data = await landmarkService.create({
      name, category, lat, lng,
      userId: (user._id as any).toString(),
    });

    res.status(201).json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * GET /api/landmarks/:landmarkId
 *
 * Fetch a single landmark by id.  Public — no auth required.
 *
 * Returns: 200 { success: true, data: LandmarkResponse }
 */
export async function getLandmark(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  if (rejectIfInvalid(req, res)) return;

  try {
    const { landmarkId } = matchedData<{ landmarkId: string }>(req, { locations: ["params"] });
    const data = await landmarkService.findById(landmarkId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * GET /api/landmarks/near?lat=&lng=&radius=&category=&limit=
 *
 * Landmarks within `radius` metres of a reference point (property coordinates),
 * sorted nearest-first with `distanceM` attached to each result.
 *
 * Used by:
 *   - Property detail map view (show up to 20 nearby POIs)
 *   - PropertyDetailMap.tsx (pins on the map with distance labels)
 *
 * Public — no auth required.
 *
 * Returns: 200 { success: true, count: number, data: LandmarkResponse[] }
 */
export async function getNearLandmarks(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  if (rejectIfInvalid(req, res)) return;

  try {
    const { lat, lng, radius, category, limit } =
      matchedData<NearQuery>(req, { locations: ["query"] });

    const data = await landmarkService.findNearProperty({
      lat, lng, radius, category, limit,
    });

    logger.info(`[LandmarkController] Found ${data.length} landmarks near (${lat}, ${lng})`);

    res.status(200).json({ success: true, count: data.length, data });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * GET /api/landmarks/search?query=&lat=&lng=&radius=&category=&limit=
 *
 * Name-substring + geo search.  Used by the "Add Landmark" modal as the user
 * types a name to surface existing nearby landmarks and prevent duplicates.
 *
 * Public — no auth required.
 *
 * Returns: 200 { success: true, count: number, data: LandmarkResponse[] }
 */
export async function searchLandmarks(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  if (rejectIfInvalid(req, res)) return;

  try {
    const { query, lat, lng, radius, category, limit } =
      matchedData<SearchQuery>(req, { locations: ["query"] });

    const data = await landmarkService.search({
      query, lat, lng, radius, category, limit,
    });

    res.status(200).json({ success: true, count: data.length, data });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * PATCH /api/landmarks/:landmarkId
 *
 * Crowdsource correction — any authenticated user may update name, category,
 * or coordinates (subject to location-lock for high-verifiedCount landmarks).
 *
 * Admin users bypass the location-lock and the creator restriction.
 *
 * Body   : { name?, category?, lat?, lng? }
 * Returns: 200 { success: true, data: LandmarkResponse }
 */
export async function updateLandmark(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  if (rejectIfInvalid(req, res)) return;

  const user = currentUser(req, res);
  if (!user) return;

  try {
    const { landmarkId } = matchedData<{ landmarkId: string }>(req, { locations: ["params"] });
    const body           = matchedData<UpdateBody>(req, {
      locations:        ["body"],
      includeOptionals: false,
    });

    const data = await landmarkService.update(
      landmarkId,
      (user._id as any).toString(),
      body,
      isAdmin(user),
    );

    res.status(200).json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * DELETE /api/landmarks/:landmarkId
 *
 * Admin users: unconditional delete.
 * Creator: may delete within 1 hour of creation (grace period).
 * Others: 403.
 *
 * Returns: 200 { success: true, message: string }
 */
export async function deleteLandmark(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  if (rejectIfInvalid(req, res)) return;

  const user = currentUser(req, res);
  if (!user) return;

  try {
    const { landmarkId } = matchedData<{ landmarkId: string }>(req, { locations: ["params"] });

    await landmarkService.remove(
      landmarkId,
      (user._id as any).toString(),
      isAdmin(user),
    );

    res.status(200).json({ success: true, message: "Landmark deleted successfully." });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * POST /api/landmarks/:landmarkId/verify
 *
 * Any authenticated user can confirm a landmark is correct and well-placed.
 * Increments verifiedCount by 1.  Once verifiedCount >= 5 the landmark's
 * coordinates become location-locked against non-admin corrections.
 *
 * Returns: 200 { success: true, data: LandmarkResponse }
 */
export async function verifyLandmark(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  if (rejectIfInvalid(req, res)) return;

  const user = currentUser(req, res);
  if (!user) return;

  try {
    const { landmarkId } = matchedData<{ landmarkId: string }>(req, { locations: ["params"] });

    const data = await landmarkService.verify(
      landmarkId,
      (user._id as any).toString(),
    );

    res.status(200).json({ success: true, data });
  } catch (err) {
    fail(res, err);
  }
}