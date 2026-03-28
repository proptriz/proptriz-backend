import { Types } from "mongoose";
import Landmark, { ILandmark } from "../models/landmark";
import { LandmarkCategoryEnum } from "../models/enums/LandmarkCategoryEnum";
import logger from "../config/loggingConfig";

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateLandmarkDto {
  name:      string;
  category?: LandmarkCategoryEnum;
  lat:       number;
  lng:       number;
  /** Authenticated user creating this landmark */
  userId:    string;
}

export interface UpdateLandmarkDto {
  name?:     string;
  category?: LandmarkCategoryEnum;
  /** Must be provided together with lng */
  lat?:      number;
  lng?:      number;
}

/**
 * Query landmarks visible in a map viewport, sorted by distance to a
 * reference point (typically the property's coordinates).
 */
export interface NearPropertyQueryDto {
  /** Reference point — property's coordinates */
  lat:        number;
  lng:        number;
  /**
   * Search radius in metres.
   * Default: 2 000 m (2 km) — covers a typical map viewport at zoom 15–16.
   * Max:     50 000 m (50 km).
   */
  radius?:    number;
  category?:  LandmarkCategoryEnum;
  /** Max results (default 20, hard cap 50) */
  limit?:     number;
}

/**
 * Free-text + geo search for the "Add Landmark" modal.
 * Used to check for existing landmarks before the user creates a new one.
 */
export interface SearchLandmarksDto {
  /** Partial name search (case-insensitive) */
  query?:    string;
  lat:       number;
  lng:       number;
  radius?:   number;
  category?: LandmarkCategoryEnum;
  limit?:    number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API RESPONSE SHAPE
// ─────────────────────────────────────────────────────────────────────────────

export interface LandmarkResponse {
  id:             string;
  name:           string;
  category:       string;
  lat:            number;
  lng:            number;
  createdBy:      string;
  lastUpdatedBy:  string;
  verifiedCount:  number;
  /** Straight-line distance in metres from the query reference point */
  distanceM?:     number;
  createdAt:      Date;
  updatedAt:      Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** GeoJSON stores [longitude, latitude] — always use this, never inline. */
function toGeoPoint(lat: number, lng: number) {
  return { type: "Point" as const, coordinates: [lng, lat] };
}

/**
 * Haversine distance between two WGS-84 points → metres.
 * Used to attach distanceM to results returned by $near (which does not
 * include distance metadata in the raw document).
 */
function haversineM(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R    = 6_371_000; // Earth radius in metres
  const φ1   = (lat1 * Math.PI) / 180;
  const φ2   = (lat2 * Math.PI) / 180;
  const Δφ   = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ   = ((lng2 - lng1) * Math.PI) / 180;
  const a    =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Map a lean Landmark document to the public API shape. */
function toResponse(
  doc: ILandmark & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date },
  refLat?: number,
  refLng?: number,
): LandmarkResponse {
  const [lng = 0, lat = 0] = (doc.map_location?.coordinates ?? []) as number[];
  const response: LandmarkResponse = {
    id:            doc._id.toString(),
    name:          doc.name,
    category:      doc.category,
    lat,
    lng,
    createdBy:     doc.createdBy?.toString() ?? "",
    lastUpdatedBy: doc.lastUpdatedBy?.toString() ?? "",
    verifiedCount: doc.verifiedCount ?? 1,
    createdAt:     doc.createdAt,
    updatedAt:     doc.updatedAt,
  };
  if (refLat !== undefined && refLng !== undefined) {
    response.distanceM = Math.round(haversineM(refLat, refLng, lat, lng));
  }
  return response;
}

/** Throw a tagged Error that the controller maps to an HTTP status. */
function httpError(message: string, status: 400 | 401 | 403 | 404 | 409): never {
  throw Object.assign(new Error(message), { status });
}

/**
 * Deduplication guard — check whether a landmark with the same name already
 * exists within `dedupeRadiusM` metres.  Returns the existing doc or null.
 *
 * The check is case-insensitive and uses $near so it respects the 2dsphere index.
 * Callers can decide to reject (create) or silently upsert (bulk).
 */
async function findDuplicate(
  name:           string,
  lat:            number,
  lng:            number,
  dedupeRadiusM:  number = 100,
  excludeId?:     Types.ObjectId,
): Promise<(ILandmark & { _id: Types.ObjectId }) | null> {
  const filter: Record<string, unknown> = {
    name:         new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    map_location: {
      $near: {
        $geometry:    { type: "Point", coordinates: [lng, lat] },
        $maxDistance: dedupeRadiusM,
      },
    },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return Landmark.findOne(filter).lean<ILandmark & { _id: Types.ObjectId }>() ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────

class LandmarkService {

  // ── CREATE ─────────────────────────────────────────────────────────────────

  /**
   * Create a new global landmark.
   *
   * Any authenticated user may create.  No property ownership required.
   *
   * Deduplication:
   *   If a landmark with the same name (case-insensitive) already exists
   *   within 100 m of the submitted coordinates, creation is rejected with
   *   409 Conflict and the existing document's id is returned in the error
   *   message so the client can surface it to the user.
   */
  async create(dto: CreateLandmarkDto): Promise<LandmarkResponse> {
    const duplicate = await findDuplicate(dto.name, dto.lat, dto.lng);
    if (duplicate) {
      httpError(
        `A landmark named "${duplicate.name}" already exists within 100 m of this location (id: ${duplicate._id}).`,
        409,
      );
    }

    const userId = new Types.ObjectId(dto.userId);
    const doc = await Landmark.create({
      name:          dto.name,
      category:      dto.category ?? LandmarkCategoryEnum.other,
      map_location:  toGeoPoint(dto.lat, dto.lng),
      createdBy:     userId,
      lastUpdatedBy: userId,
      verifiedCount: 1,
    });

    logger.info(`[LandmarkService.create] ${doc._id} by user ${dto.userId}`);
    return toResponse(doc as ILandmark & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date });
  }

  // ── READ: single ──────────────────────────────────────────────────────────

  async findById(landmarkId: string): Promise<LandmarkResponse> {
    if (!Types.ObjectId.isValid(landmarkId)) httpError("Invalid landmark id.", 400);

    const doc = await Landmark
      .findById(landmarkId)
      .lean<ILandmark & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }>();

    if (!doc) httpError("Landmark not found.", 404);
    return toResponse(doc);
  }

  // ── READ: landmarks near a property ───────────────────────────────────────

  /**
   * Return landmarks within `radius` metres of a property's coordinates,
   * sorted nearest-first.  This is the primary read path for the property
   * detail / map view.
   *
   * `distanceM` (straight-line Haversine) is attached to every result so
   * the frontend can render "280 m away" distance badges without a routing
   * API call for the list view (OSRM road distances are fetched separately
   * for the selected landmark on the map).
   *
   * Accepts either:
   *   a) lat + lng + radius  (centre-point search)
   *   b) propertyId          (resolves the property's coordinates server-side)
   */
  async findNearProperty(dto: NearPropertyQueryDto): Promise<LandmarkResponse[]> {
    const radius = Math.min(dto.radius ?? 2_000, 50_000);
    const limit  = Math.min(dto.limit  ?? 20,    50);

    const geoFilter: Record<string, unknown> = {
      map_location: {
        $near: {
          $geometry:    { type: "Point", coordinates: [dto.lng, dto.lat] },
          $maxDistance: radius,
        },
      },
    };
    if (dto.category) geoFilter.category = dto.category;

    // $near returns documents already sorted nearest-first by the index
    const docs = await Landmark
      .find(geoFilter)
      .limit(limit)
      .lean<Array<ILandmark & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }>>();

    // Attach haversine distance from the reference point
    return docs.map(doc => toResponse(doc, dto.lat, dto.lng));
  }

  // ── READ: search (dedup check from Add-Landmark modal) ────────────────────

  /**
   * Name-substring + geo search.
   *
   * Called by the frontend "Add Landmark" modal as the user types a name,
   * to surface existing nearby landmarks and prevent duplicates.
   *
   * Returns up to `limit` matching landmarks sorted by distance.
   */
  async search(dto: SearchLandmarksDto): Promise<LandmarkResponse[]> {
    const radius = Math.min(dto.radius ?? 2_000, 50_000);
    const limit  = Math.min(dto.limit  ?? 10,    20);

    const filter: Record<string, unknown> = {
      map_location: {
        $near: {
          $geometry:    { type: "Point", coordinates: [dto.lng, dto.lat] },
          $maxDistance: radius,
        },
      },
    };

    if (dto.query?.trim()) {
      // Partial case-insensitive match on name
      filter.name = new RegExp(dto.query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }

    if (dto.category) filter.category = dto.category;

    const docs = await Landmark
      .find(filter)
      .limit(limit)
      .lean<Array<ILandmark & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }>>();

    return docs.map(doc => toResponse(doc, dto.lat, dto.lng));
  }

  // ── UPDATE (crowdsource) ──────────────────────────────────────────────────

  /**
   * Partial update — name, category, and/or coordinates.
   *
   * Authorization rules:
   *   - ANY authenticated user may correct a landmark's details.
   *     This is the crowdsource model (like OpenStreetMap edits).
   *   - Admin users bypass all restrictions.
   *   - Non-admin users may NOT relocate a landmark that already has
   *     verifiedCount >= 5 (high-confidence POIs are location-locked
   *     against accidental vandalism; name/category can still be corrected).
   *
   * Deduplication:
   *   If the updated name + location would duplicate another existing
   *   landmark within 100 m, the update is rejected with 409.
   *
   * Audit trail:
   *   lastUpdatedBy is always stamped.
   *   verifiedCount is incremented by 1 for each non-admin confirmation.
   */
  async update(
    landmarkId:  string,
    userId:      string,
    dto:         UpdateLandmarkDto,
    isAdmin:     boolean = false,
  ): Promise<LandmarkResponse> {
    if (!Types.ObjectId.isValid(landmarkId)) httpError("Invalid landmark id.", 400);

    const existing = await Landmark
      .findById(landmarkId)
      .lean<ILandmark & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }>();

    if (!existing) httpError("Landmark not found.", 404);

    const $set: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      $set.name = dto.name;
    }

    if (dto.category !== undefined) {
      $set.category = dto.category;
    }

    if (dto.lat !== undefined && dto.lng !== undefined) {
      // Non-admins cannot relocate a high-confidence landmark
      if (!isAdmin && (existing.verifiedCount ?? 0) >= 5) {
        httpError(
          "This landmark has been verified by multiple users and its location is locked. " +
          "You may still correct its name or category.",
          403,
        );
      }
      $set.map_location = toGeoPoint(dto.lat, dto.lng);
    }

    if (Object.keys($set).length === 0) httpError("No fields provided for update.", 400);

    // Deduplication check for name/coordinate changes
    const newName = (dto.name ?? existing.name) as string;
    const [existingLng, existingLat] = (existing.map_location?.coordinates ?? [0, 0]) as number[];
    const newLat = dto.lat ?? existingLat;
    const newLng = dto.lng ?? existingLng;

    const duplicate = await findDuplicate(
      newName, newLat, newLng,
      100,
      existing._id,
    );
    if (duplicate) {
      httpError(
        `Another landmark named "${duplicate.name}" already exists within 100 m (id: ${duplicate._id}).`,
        409,
      );
    }

    // Stamp audit fields
    $set.lastUpdatedBy = new Types.ObjectId(userId);

    const $inc: Record<string, number> = {};
    if (!isAdmin) {
      // Each user confirmation nudges the trust score upward
      $inc.verifiedCount = 1;
    }

    const updated = await Landmark.findByIdAndUpdate(
      landmarkId,
      { $set, ...( Object.keys($inc).length ? { $inc } : {} ) },
      { new: true, runValidators: true },
    ).lean<ILandmark & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }>();

    if (!updated) httpError("Landmark not found after update.", 404);

    logger.info(
      `[LandmarkService.update] ${landmarkId} by ${isAdmin ? "admin" : "user"} ${userId}`,
    );
    return toResponse(updated);
  }

  // ── DELETE (admin-only, or creator within grace window) ───────────────────

  /**
   * Delete a landmark.
   *
   * Authorization rules:
   *   - Admin users may delete any landmark unconditionally.
   *   - The original creator may delete their own landmark within 1 hour
   *     of creation (grace period to fix accidental submissions).
   *   - All other delete attempts are rejected with 403.
   *
   * Note: because landmarks are global (not property-specific), deletion
   * is a significant action — it removes the POI for ALL users.
   * Admin gate + short creator grace window is the appropriate safeguard.
   */
  async remove(
    landmarkId: string,
    userId:     string,
    isAdmin:    boolean = false,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(landmarkId)) httpError("Invalid landmark id.", 400);

    const doc = await Landmark.findById(landmarkId);
    if (!doc) httpError("Landmark not found.", 404);

    // Admin: unconditional delete
    if (isAdmin) {
      await doc.deleteOne();
      logger.info(`[LandmarkService.remove] ${landmarkId} deleted by admin ${userId}`);
      return;
    }

    // Creator grace window: 1 hour
    const isCreator = doc.createdBy?.toString() === userId;
    const ageMs     = Date.now() - (doc as any).createdAt.getTime();
    const ONE_HOUR  = 60 * 60 * 1000;

    if (isCreator && ageMs <= ONE_HOUR) {
      await doc.deleteOne();
      logger.info(`[LandmarkService.remove] ${landmarkId} deleted by creator ${userId} (within grace period)`);
      return;
    }

    if (isCreator) {
      httpError(
        "The 1-hour deletion window has passed. Contact an administrator to remove this landmark.",
        403,
      );
    }

    httpError("Only administrators may delete landmarks they did not create.", 403);
  }

  // ── VERIFY (increment trust score) ────────────────────────────────────────

  /**
   * Any authenticated user can confirm a landmark exists and is correctly
   * placed.  This increments verifiedCount by 1.
   *
   * The frontend shows a "Confirm this landmark" button on the map popup.
   * Once verifiedCount >= 5 the landmark's coordinates become location-locked
   * against non-admin updates.
   */
  async verify(landmarkId: string, userId: string): Promise<LandmarkResponse> {
    if (!Types.ObjectId.isValid(landmarkId)) httpError("Invalid landmark id.", 400);

    const updated = await Landmark.findByIdAndUpdate(
      landmarkId,
      {
        $inc: { verifiedCount: 1 },
        $set: { lastUpdatedBy: new Types.ObjectId(userId) },
      },
      { new: true, runValidators: true },
    ).lean<ILandmark & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }>();

    if (!updated) httpError("Landmark not found.", 404);

    logger.info(`[LandmarkService.verify] ${landmarkId} confirmed by user ${userId}`);
    return toResponse(updated);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
export const landmarkService = new LandmarkService();