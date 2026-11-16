import logger from "../config/loggingConfig";
import { buildGeoSearchCriteria } from "../helpers/buildFilter";
import Property from "../models/property";
import { IProperty, IUser } from "../types";
import { PipelineStage, FilterQuery, UpdateQuery } from "mongoose";
import { deleteFromCloudinary, uploadToCloudinary } from "./misc/image.service";
import { ListForEnum } from "../models/enums/ListForEnum";
import UserSettings, { UserSettingsType } from "../models/userSettings";
import { PropertyStatusEnum } from "../models/enums/PropertyStatusEnum";
import { decodeCursor } from "../helpers/cursor";
import { LeanWithId } from "../helpers/leanWithId";
import paginateWithCursor from "../helpers/paginateWithCursor";
import PropertyContact from "../models/propertyContact";
import { buildPropertyLocation, ladderFilters, parseTypedPrefix, placeLadderFilters } from "../postcode";
import type { MatchTier, TierFilter } from "../postcode";
import { Types } from "mongoose";

const COLLOCATED_MIN_FOR_LADDER = 2; // fewer same-area matches than this -> fall through to the next tier
const hasRealPin = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  !(lat === 0 && lng === 0) &&
  !(lat === 9.082 && lng === 8.6753); // the app's fallback position, not a pin the user chose
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const defined = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const PAGE_LIMIT = 10;

type LeanPropertyWithCursor = LeanWithId<IProperty> & {
  createdAt: Date;
};

class PropertyService {

  async updatePropertyImage(
    propertyId: string,
    file: Express.Multer.File,
    replaceIndex?: number   // optional — if provided, replaces existing image
  ): Promise<string> {
    try {
      // Fetch full Mongoose document (not lean)
      const property = await Property.findById(propertyId);
      if (!property) {
        throw new Error(`Property with ID ${propertyId} not found`);
      }

      const maxImages = 5;

      // If replacing: ensure index is valid
      if (replaceIndex !== undefined) {
        if (replaceIndex < 0 || replaceIndex >= property.images.length) {
          throw new Error(`Invalid replace index ${replaceIndex}`);
        }
      } else {
        // If uploading new: ensure limit not exceeded
        if (property.images.length >= maxImages) {
          throw new Error("Maximum of 5 images allowed for a property");
        }
      }

      // Decide the image number (slug-X)
      const imageNumber =
        replaceIndex !== undefined ? replaceIndex + 1 : property.images.length + 1;

      // Upload to Cloudinary
      const imageUrl = await uploadToCloudinary(
        file.buffer,
        `properties/${property.category}`,
        `${property.slug}-${imageNumber}`
      );

      if (!imageUrl) throw new Error("Image upload failed");

      // === HANDLE REPLACE ===
      if (replaceIndex !== undefined) {
        // Delete old image from Cloudinary
        const oldImage = property.images[replaceIndex];
        if (oldImage) {
          await deleteFromCloudinary([oldImage]);
        }

        // Replace the image
        property.images[replaceIndex] = imageUrl;

        // If replacing the banner (index 0)
        if (replaceIndex === 0) {
          property.banner = imageUrl;
        }
      }

      // === HANDLE NEW UPLOAD ===
      else {
        logger.info(`adding image with url: ${imageUrl} to property id: ${propertyId}`);
        property.images.push(imageUrl);
        if (property.images.length === 1) {
          property.banner = imageUrl; // first image becomes banner
        }
      }

      await property.save();
      return imageUrl;

    } catch (error: any) {
      logger.error("Error uploading property image:", error);
      throw new Error(`Failed to upload property image: ${error.message}`);
    }
  }

  async deletePropertyImage(
    propertyId: string,
    imageUrl: string
  ): Promise<IProperty> {
    try {
      const property = await Property.findById(propertyId);
      if (!property) {
        throw new Error(`Property with ID ${propertyId} not found`);
      }
      const imageIndex = property.images.indexOf(imageUrl);
      if (imageIndex === -1) {
        throw new Error("Image URL not found in property images");
      }
      // Delete from Cloudinary
      await deleteFromCloudinary([imageUrl]);
      // Remove from property images array
      property.images.splice(imageIndex, 1);
      // If deleted image was banner, update banner
      if (property.banner === imageUrl) {
        property.banner = property.images[0] || ""; // set to first image or empty
      }
      await property.save();
      return property;
    } catch (error: any) {
      logger.error("Error deleting property image:", { error });
      throw new Error(`Failed to delete property image: ${error.message}`);
    }
  }
    
  // Create a new property
  async createProperty(authUser: IUser, propertyData: any): Promise<IProperty> {
    try {
      // logger.info("Service log: creating property", { propertyData });

      // ✅ Coordinates
      const prop_cord =
        propertyData.latitude && propertyData.longitude
          ? [parseFloat(propertyData.longitude), parseFloat(propertyData.latitude)]
          : [9.082, 8.6753];

      // --- Create new item ---
      const now = new Date(Date.now());
      const duration = Math.max(Number(propertyData.duration) || 3, 1); //in weeks
      const expiredBy = new Date(now.getTime() + duration * 7 * 24 * 60 * 60 * 1000);

      // ✅ Country + NIPOST postcode (Nigeria only). Never blocks publishing.
      const [lng, lat] = prop_cord;
      const hasPin = !!(propertyData.latitude && propertyData.longitude) && hasRealPin(lat, lng);
      const location = hasPin
        ? await buildPropertyLocation({
            lat,
            lng,
            country: propertyData.country,
            address: propertyData.address,
            typedPostcode: propertyData.postcode_input,
          })
        : {};

      // ✅ Create base property object
      const { postcode_input: _postcodeInput, country: _country, postcode: _clientPostcode, place: _clientPlace, ...cleanData } = propertyData;
      const property = new Property({
        ...cleanData,
        ...defined(location as Record<string, unknown>),
        period: propertyData.listed_for === ListForEnum.rent ? propertyData.period : null,
        price: parseFloat(propertyData.price),
        duration: duration,
        expired_by: expiredBy,
        user: authUser._id,
        username: authUser.display_name,
        map_location: {
          type: "Point",
          coordinates: prop_cord,
        },
        features: propertyData.features || [],
      });

      // ✅ Step 1: Save first to trigger pre-save hook for slug
      const savedProperty = await property.save();
      logger.info(`Property base saved with slug:, ${savedProperty.slug}`);

      logger.info("Property created successfully:", savedProperty._id);
      return savedProperty;
    } catch (error: any) {
      logger.error("Error in PropertyService.createProperty:", {error});
      throw new Error(`Failed to create property: ${error}`);
    }
  }

  // Get a single property by its ID
  async getPropertyById(propertyId: string): Promise<{property:IProperty, userDetails: UserSettingsType | null} | null> {
    try {
      // populate user with its _id so we can lookup settings by user id
      const property = await Property.findById(propertyId)
        .populate('user', 'username _id')
        .lean();

      if (!property || !property.user) return null;

      // handle both populated user object and raw ObjectId
      const userId = (property.user as any)?._id ?? property.user;

      const userDetails = await UserSettings.findOne({ user: userId })
        .lean();

      logger.info("fetched owner:", { userDetails });
      return { property: property as IProperty, userDetails: userDetails as UserSettingsType | null };
    } catch (error: any) {
      throw new Error(`Failed to retrieve property with ID ${propertyId}: ${error.message}`);
    }
  }

  // Get a list of properties based on a filter
  async getProperties(
    searchQuery: string,
    filter: FilterQuery<IProperty> = {},
    cursor?: string
  ): Promise<{
    properties: any[];
    nextCursor: string | null;
  }>  {
    try {
      const cursorMatch = decodeCursor(cursor);

      // Build text/multi-field search
      // ✅ Merge filters safely
      
      // ✅ GEO-SAFE search
      const geoSearchMatch =
        searchQuery.trim().length > 0
          ? buildGeoSearchCriteria(searchQuery)
          : null;

      const now = new Date();

      const pipeline: PipelineStage[] = [
        {
          $match: {
            $and: [
              filter,
              geoSearchMatch ? geoSearchMatch : {},
              {
                status: PropertyStatusEnum.available,
                expired_by: { $gt: now }
              },
              ...(cursor ? [cursorMatch] : [])
            ]
          }
        },

        { $sort: { createdAt: -1, _id: -1 } },

        // Fetch one extra to know if there is a next page
        { $limit: PAGE_LIMIT + 1 },

        {
          $project: {
            _id: 1,
            title: 1,
            category: 1,
            price: 1,
            address: 1,
            banner: 1,
            listed_for: 1,
            currency: 1,
            period: 1,
            average_rating: 1,
            createdAt: 1,
            "postcode.public_code": 1,
            "postcode.verified": 1,
            "place.verified": 1,
            "place.area": 1,
            "place.subregion": 1,
            "place.region": 1,
            longitude: { $arrayElemAt: ["$map_location.coordinates", 0] },
            latitude: { $arrayElemAt: ["$map_location.coordinates", 1] }
          }
        }
      ];

      const properties = await Property.aggregate(pipeline).exec();
      // logger.info("fetched properties", properties.length);

      const paginatedProp = paginateWithCursor(properties, PAGE_LIMIT);

      return {
        properties: paginatedProp.page,
        nextCursor: paginatedProp.nextCursor
      };
      
    } catch (error: any) {
      logger.error("Error in PropertyService.getProperties:", {error});
      throw new Error(`Failed to retrieve properties: ${error.message}`);
    }
  }

  async getNearestProperties(params: {
    lat: number;
    lng: number;
    searchQuery?: string;
    filter?: FilterQuery<IProperty>;
    cursor?: string;
    limit?: number;
  }): Promise<{
    properties: any[];
    nextCursor: string | null;
  }> {
    try {
      const {
        lat,
        lng,
        searchQuery = "",
        filter = {},
        cursor,
        limit = PAGE_LIMIT,
      } = params;

      const now = new Date();
      const cursorMatch = cursor ? decodeCursor(cursor) : null;

      // ✅ GEO-SAFE filters only
      const geoQuery = {
        ...filter,
        status: PropertyStatusEnum.available,
        expired_by: { $gt: now },
      };

      // ✅ GEO-SAFE search
      const geoSearchMatch =
        searchQuery.trim().length > 0
          ? buildGeoSearchCriteria(searchQuery)
          : null;

      const pipeline: PipelineStage[] = [
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [lng, lat],
            },
            distanceField: "distance",
            spherical: true,
            key: "map_location",
            query: geoQuery,
          },
        },

        ...(geoSearchMatch ? [{ $match: geoSearchMatch }] : []),

        ...(cursorMatch ? [{ $match: cursorMatch }] : []),

        { $sort: { distance: 1, _id: -1 } },

        { $limit: limit + 1 },

        {
          $project: {
            _id: 1,
            title: 1,
            category: 1,
            price: 1,
            currency: 1,
            address: 1,
            banner: 1,
            listed_for: 1,
            period: 1,
            average_rating: 1,
            distance: 1,
            createdAt: 1,
            longitude: { $arrayElemAt: ["$map_location.coordinates", 0] },
            latitude: { $arrayElemAt: ["$map_location.coordinates", 1] },
          },
        },
      ];

      const properties = await Property.aggregate(pipeline).exec();
      const paginated = paginateWithCursor(properties, limit);

      return {
        properties: paginated.page,
        nextCursor: paginated.nextCursor,
      };
    } catch (error: any) {
      throw new Error(`Failed to retrieve nearest properties: ${error.message}`);
    }
  }


  /**
   * Listings near a property. `tier` picks how wide to look:
   *   auto (default)  same area -> district -> sub-region (LGA) -> region (state) -> distance
   *   area | district | subregion | region   only that tier (empty list if nothing matches)
   *   distance        plain nearest, as before
   * Nigerian listings use postcode segments; other countries use stored place names.
   */
  async getCollocatedProperties(
    propertyId: string,
    limit: number = 4,
    tier: MatchTier | "auto" = "auto"
  ): Promise<{ properties: any[]; match_tier: MatchTier; tiers: MatchTier[] }> {
    try {
      const now = new Date();

      // 1️⃣ Find the property to get its coordinates (+ postcode segments, which are select:false)
      const targetProperty = await Property.findById(propertyId)
        .select("map_location country place +postcode.code +postcode.segments")
        .lean();

      if (!targetProperty || !targetProperty.map_location?.coordinates) {
        throw new Error("Property location not found");
      }

      const [lng, lat] = targetProperty.map_location.coordinates;

      const projection = {
        _id: 1,
        title: 1,
        currency: 1,
        price: 1,
        category: 1,
        address: 1,
        banner: 1,
        listed_for: 1,
        period: 1,
        username: 1,
        distance: 1,
        "postcode.public_code": 1,
        "postcode.verified": 1,
        "place.verified": 1,
        longitude: { $arrayElemAt: ["$map_location.coordinates", 0] },
        latitude: { $arrayElemAt: ["$map_location.coordinates", 1] },
      };

      const nearest = (query: Record<string, unknown>) =>
        Property.aggregate([
          {
            $geoNear: {
              near: { type: "Point", coordinates: [lng, lat] },
              distanceField: "distance",
              spherical: true,
              key: "map_location",
              query: {
                ...query,
                _id: { $ne: targetProperty._id },
                status: PropertyStatusEnum.available,
                expired_by: { $gt: now },
              },
            },
          },
          { $sort: { distance: 1 } },
          { $limit: limit },
          { $project: projection },
        ] as PipelineStage[]).exec();

      // 2️⃣ Tiers this listing supports: postcode segments (Nigeria) or place names (anywhere)
      const ladder: TierFilter[] =
        targetProperty.country === "NG" && targetProperty.postcode?.code
          ? ladderFilters(targetProperty.postcode.code)
          : placeLadderFilters({ country: targetProperty.country, ...(targetProperty.place ?? {}) });
      const tiers: MatchTier[] = [...ladder.map((l) => l.tier), "distance"];

      if (tier !== "auto" && tier !== "distance") {
        const wanted = ladder.find((l) => l.tier === tier);
        return { properties: wanted ? await nearest(wanted.filter) : [], match_tier: tier, tiers };
      }

      if (tier === "auto") {
        for (const [i, step] of ladder.entries()) {
          const found = await nearest(step.filter);
          const last = i === ladder.length - 1;
          if (found.length >= COLLOCATED_MIN_FOR_LADDER || (last && found.length > 0)) {
            return { properties: found, match_tier: step.tier, tiers };
          }
        }
      }

      // 3️⃣ Plain nearest
      return { properties: await nearest({}), match_tier: "distance", tiers };
    } catch (error: any) {
      throw new Error(`Failed to find nearest properties: ${error.message}`);
    }
  }

  /**
   * Suggestions for the search box, built from our own listings so every row has results.
   *   "LA 11 U"  -> postcode prefixes (Nigeria) with listing counts
   *   "Westl"    -> areas / sub-regions / regions by name (any country) with listing counts
   */
  async suggestLocations(q: string, limit = 8): Promise<any[]> {
    const now = new Date();
    const live = { status: PropertyStatusEnum.available, expired_by: { $gt: now } };
    const typed = parseTypedPrefix(q);

    if (typed) {
      const order = ["state", "lga", "district", "area", "unit"] as const;
      const tierOf = { state: "region", lga: "subregion", district: "district", area: "area", unit: "unit" } as const;
      const done = order.filter((k) => typed.complete[k]);
      const groupKey = typed.partialKey ?? order[done.length];
      if (!groupKey || groupKey === "unit") {
        // A full area (or unit) was typed: one row for that area
        const [step] = ladderFilters(done.slice(0, 4).map((k) => typed.complete[k]).join("-"));
        if (!step) return [];
        const count = await Property.countDocuments({ ...live, ...step.filter });
        const sample = await Property.findOne({ ...live, ...step.filter }).select("place").lean();
        return count
          ? [{
              kind: "postcode",
              tier: step.tier,
              code: done.slice(0, 4).map((k) => typed.complete[k]).join("-"),
              label: [sample?.place?.area, sample?.place?.subregion, sample?.place?.region].filter(Boolean).join(", "),
              count,
              country: "NG",
            }]
          : [];
      }

      const match: Record<string, unknown> = { ...live, country: "NG" };
      for (const k of done) match[`postcode.segments.${k}`] = typed.complete[k];
      if (typed.partial) match[`postcode.segments.${groupKey}`] = { $regex: `^${escapeRegex(typed.partial)}` };
      else match[`postcode.segments.${groupKey}`] = { $exists: true };

      const rows = await Property.aggregate([
        { $match: match },
        {
          $group: {
            _id: `$postcode.segments.${groupKey}`,
            count: { $sum: 1 },
            region: { $first: "$place.region" },
            subregion: { $first: "$place.subregion" },
          },
        },
        { $sort: { count: -1, _id: 1 } },
        { $limit: limit },
      ]).exec();

      const children = rows.map((r) => ({
        kind: "postcode",
        tier: tierOf[groupKey],
        code: [...done.map((k) => typed.complete[k]), r._id].join("-"),
        label: (groupKey === "state" ? [r.region] : [r.subregion, r.region]).filter(Boolean).join(", "),
        count: r.count,
        country: "NG",
      }));

      // The prefix typed so far is itself a choice ("LA-11" = the whole LGA)
      const own: any[] = [];
      if (done.length && !typed.partial) {
        const total = children.reduce((n, c) => n + c.count, 0);
        const first = rows[0];
        if (total) {
          own.push({
            kind: "postcode",
            tier: tierOf[done[done.length - 1]],
            code: done.map((k) => typed.complete[k]).join("-"),
            label: (done.length === 1 ? [first?.region] : [first?.subregion, first?.region]).filter(Boolean).join(", "),
            count: await Property.countDocuments(
              Object.fromEntries(Object.entries(match).filter(([k]) => k !== `postcode.segments.${groupKey}`))
            ),
            country: "NG",
          });
        }
      }

      // Two letters could be a state code or the start of a name ("La" -> Lagos, Lamu...)
      const names = q.trim().length === 2 ? await this.suggestByName(q, limit) : [];
      return [...own, ...children, ...names].slice(0, limit);
    }

    return this.suggestByName(q, limit);
  }

  private async suggestByName(q: string, limit: number): Promise<any[]> {
    const now = new Date();
    const live = { status: PropertyStatusEnum.available, expired_by: { $gt: now } };

    // Names: neighbourhood, then sub-region (LGA / county), then region (state)
    const rx = { $regex: `^${escapeRegex(q.trim())}`, $options: "i" };
    const levels = [
      { tier: "area", field: "place.area", id: { country: "$country", region: "$place.region", subregion: "$place.subregion", area: "$place.area" } },
      { tier: "subregion", field: "place.subregion", id: { country: "$country", region: "$place.region", subregion: "$place.subregion" } },
      { tier: "region", field: "place.region", id: { country: "$country", region: "$place.region" } },
    ] as const;

    const groups = await Promise.all(
      levels.map((l) =>
        Property.aggregate([
          { $match: { ...live, [l.field]: rx } },
          { $group: { _id: l.id, count: { $sum: 1 }, country_name: { $first: "$place.country_name" } } },
          { $sort: { count: -1 } },
          { $limit: limit },
        ]).exec().then((rows) =>
          rows.map((r) => ({
            kind: "place",
            tier: l.tier,
            country: r._id.country,
            region: r._id.region,
            subregion: r._id.subregion,
            area: r._id.area,
            name: r._id.area ?? r._id.subregion ?? r._id.region,
            label: [r._id.area ? r._id.subregion : undefined, r._id.area || r._id.subregion ? r._id.region : r.country_name]
              .filter(Boolean)
              .join(", "),
            count: r.count,
          }))
        )
      )
    );
    return groups.flat().filter((g) => g.country).slice(0, limit);
  }

  // Get a list of properties based on a filter
  async getUserProperties(
    authUser: IUser,
    cursor?: string
  ): Promise<any> {
    try {
      logger.info("getting user listed prop");

      const query = { 
        user: authUser._id,
        ...decodeCursor(cursor) 
      };

      const properties = await  Property.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(Math.min(PAGE_LIMIT + 1, 20))
      .select({
        _id: 1,
        title: 1,
        category: 1,
        price: 1,
        currency: 1,
        address: 1,
        banner: 1,
        listed_for: 1,
        expired_by: 1,
        period: 1,
        username: 1,
        average_rating: 1,
        map_location: 1,
        createdAt: 1 
      })
      .lean<LeanPropertyWithCursor[]>()
      .exec();   

      logger.info("User total properties", properties.length);

      let propTotalCount = null;

      if (!cursor) {
        const ownedPropertyIds = await Property.find(
          { user: authUser._id },
          { _id: 1 }
        ).lean().exec();
    
        propTotalCount = await Property.countDocuments({
          property: { $in: ownedPropertyIds.map(p => p._id) }
        });
      }

      const paginated = paginateWithCursor(properties, PAGE_LIMIT);

      return {
        totalProperties: propTotalCount,
        properties: paginated.page,
        nextCursor: paginated.nextCursor
        
      };
    } catch (error: any) {
      throw new Error(`Failed to retrieve properties: ${error.message}`);
    }
  }

  // Update a property by its ID
  async updateProperty(propertyId: string, updateData: UpdateQuery<IProperty>): Promise<IProperty | null> {
    try {
      // logger.info("update data: ", {updateData})
      const property = await Property.findById(propertyId).exec()

      if (!property) {
        throw new Error("Property not found");
      }

      let expiredBy = property.expired_by;
      let duration = property.duration;
      const now = new Date();

      // only change expired_by of expired expired property
      if (updateData.duration !== undefined && expiredBy < now) {
        const durationWeeks = Math.max(Number(updateData.duration) || 3, 1); // min 1 week
        expiredBy = new Date(now.getTime() + durationWeeks * 7 * 24 * 60 * 60 * 1000);
        duration = durationWeeks;
      }

      // ✅ Re-resolve country/postcode only when the pin moved or a postcode was typed
      // `postcode` and `place` are server-owned. The edit form sends the whole listing back, including
      // the masked public postcode, which must never overwrite the stored one.
      const { postcode_input, country: providedCountry, postcode: _clientPostcode, place: _clientPlace, match_tier: _tier, ...rest } =
        updateData as any;
      const newCoords: number[] | undefined = rest.map_location?.coordinates;
      const oldCoords = property.map_location?.coordinates ?? [];
      const validCoords = Array.isArray(newCoords) && newCoords.length === 2 && newCoords.every(Number.isFinite);
      if (!validCoords) delete rest.map_location; // controller sends NaN coords when the form has none
      const pinMoved =
        validCoords &&
        (Math.abs(newCoords![0] - (oldCoords[0] ?? NaN)) > 1e-5 || Math.abs(newCoords![1] - (oldCoords[1] ?? NaN)) > 1e-5);

      // A listing saved before this feature has no `place` yet: fill it on its next edit.
      const addressChanged = typeof rest.address === "string" && rest.address !== property.address;
      const needsLocation = pinMoved || !!postcode_input || !property.place || (addressChanged && property.country !== "NG");

      let locationPatch: Record<string, unknown> = {};
      if (needsLocation) {
        const [lng, lat] = validCoords ? newCoords! : oldCoords;
        if (hasRealPin(lat, lng)) {
          locationPatch = defined(
            (await buildPropertyLocation({
              lat,
              lng,
              country: providedCountry,
              address: rest.address ?? property.address,
              typedPostcode: postcode_input,
            })) as Record<string, unknown>
          );
        }
      }

      const updatedProperty = await Property.findByIdAndUpdate(
        propertyId,
        { ...rest, ...locationPatch, 
          period: rest.listed_for === ListForEnum.rent ? rest.period : null,
          price: parseFloat(rest.price),
          duration: duration,
          expired_by: expiredBy,
          updatedAt: new Date() 
        },
        { new: true, runValidators: true }
      ).lean().exec();

      if (!updatedProperty) {
        throw new Error(`Property with ID ${propertyId} not found`);
      }

      return updatedProperty;
    } catch (error: any) {
      throw new Error(`Failed to update property with ID ${propertyId}: ${error.message}`);
    }
  }

  /**
   * Records that a user reached out (Call / Email / Chat) and returns the full postcode.
   * The owner always sees their own code and is never recorded as a lead.
   */
  async recordContact(
    propertyId: string,
    authUser: IUser,
    channel: "call" | "email" | "chat"
  ): Promise<{ postcode: string | null; owner: boolean }> {
    const property = await Property.findById(propertyId).select("user +postcode.code").lean();
    if (!property) throw new Error("Property not found");

    const owner = String(property.user) === String(authUser._id);
    if (!owner) {
      await PropertyContact.updateOne(
        { property: property._id, user: authUser._id, channel },
        { $setOnInsert: { property: property._id, user: authUser._id, channel } },
        { upsert: true }
      );
    }
    return { postcode: property.postcode?.code ?? null, owner };
  }

  /** Full postcode for the owner, or for a user who has already contacted the agent. */
  async getFullPostcode(propertyId: string, authUser: IUser): Promise<{ postcode: string | null } | null> {
    const property = await Property.findById(propertyId).select("user +postcode.code").lean();
    if (!property) throw new Error("Property not found");

    const owner = String(property.user) === String(authUser._id);
    const contacted = owner || !!(await PropertyContact.exists({ property: property._id, user: authUser._id }));
    if (!contacted) return null;
    return { postcode: property.postcode?.code ?? null };
  }

  /** Lead count per property for the owner's dashboard (optional helper). */
  async countContacts(propertyIds: Types.ObjectId[]): Promise<Record<string, number>> {
    const rows = await PropertyContact.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { property: { $in: propertyIds } } },
      { $group: { _id: "$property", n: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
  }

  async deleteUserProperty(propertyId: string, authUser: IUser): Promise<void> {
    try {
      // ✅ Step 1: Find property first (to access its image URLs)
      const property = await Property.findOne({ _id: propertyId, user: authUser._id }).exec();

      if (!property) {
        throw new Error(`Property with ID ${propertyId} not found or not owned by user`);
      }

      // ✅ Step 2: Delete images from Cloudinary
      await deleteFromCloudinary([
        property.banner,
        ...(property.images || []),
      ]);

      // ✅ Step 4: Delete property document
      await property.deleteOne();
      logger.info("Deleted property and associated Cloudinary images:", propertyId);
    } catch (error: any) {
      logger.error("Error deleting property:", error);
      throw new Error(`Failed to delete property with ID ${propertyId}: ${error}`);
    }
  }

  // Delete a property by its ID
  async deleteProperty(propertyId: string): Promise<void> {
    try {
      const result = await Property.findByIdAndDelete(propertyId).exec();

      if (!result) {
        throw new Error(`Property with ID ${propertyId} not found`);
      }
      logger.info('deleted property with id:', propertyId);
    } catch (error: any) {
      throw new Error(`Failed to delete property with ID ${propertyId}: ${error.message}`);
    }
  }
}

export default new PropertyService();
