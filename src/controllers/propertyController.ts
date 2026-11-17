import { Request, Response } from "express";
import PropertyService from "../services/property.service";
import logger from "../config/loggingConfig";
import { IUser } from "../types";
import runExtractProperty from "../utils/extractProperty";
import { ladderFilters, placeLadderFilters } from "../postcode";
import type { MatchTier, TierFilter } from "../postcode";
// import {populateUsertype} from "../../scripts/propMigrations"

/** Turns a tier's Mongo filter back into the query params the client should send for the next page. */
const describeApplied = (filter: Record<string, string>) => {
  const seg = (k: string) => filter[`postcode.segments.${k}`];
  if (seg("state")) {
    return { postcode: ["state", "lga", "district", "area"].map(seg).filter(Boolean).join("-") };
  }
  return {
    place_country: filter.country,
    place_region: filter["place.region"],
    place_subregion: filter["place.subregion"],
    place_area: filter["place.area"],
  };
};

const PropertyController = {
  
  // Add a new property
  async addProperty(req: Request, res: Response) {
    try {
      const authUser = req.currentUser as IUser;
      const formData = req.body;

      // ✅ Log only the keys of formData, not full content
      // logger.debug("Received property formData keys:", Object.keys(formData));

      // ✅ Parse structured JSON fields
      const parsedFeatures = formData.features
        ? JSON.parse(formData.features)
        : [];

      const parsedFacilities = formData.env_facilities
        ? JSON.parse(formData.env_facilities)
        : [];

      // ✅ Construct cleaned data object
      const propertyData = {
        ...formData,
        features: parsedFeatures,
        env_facilities: parsedFacilities
      };

      // logger.info("Property data after parsing:", {
      //   ...propertyData,
      //   featuresCount: parsedFeatures.length,
      //   facilitiesCount: parsedFacilities.length,
      // });

      // ✅ Create property
      const property = await PropertyService.createProperty(authUser, propertyData);

      logger.info("Property created successfully:", property._id);

      return res.status(201).json({
        success: true,
        property,
      });
    } catch (error: any) {
      logger.error("Error creating property:", error.message, error.stack);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to create property",
      });
    }
  },

  async extractPropertyData(req: Request, res: Response) {
    try {
      const description = req.body.description;

      // ✅ Log only the keys of formData, not full content
      // logger.info("Extracting property data from description. Description length:", description);
      const property = await runExtractProperty(description);

      logger.info("Propertyinfo extracted successfully:", property );

      return res.status(201).json({
        success: true,
        propertyData: {
          ...property,
          description
        },
      });
      
    } catch (error: any) {
      logger.error("Error extracting property data:", error, error.stack);
      return res.status(400).json({
        success: false,
        message: "Failed to extract property data",
      });
    }
  },

  // Get a property by ID
  async getPropertyById(req: Request, res: Response) {
    try {
      logger.info("Fetching property with ID:", req.params.pid);
      const propertyId = req.params.pid;
      const result = await PropertyService.getPropertyById(propertyId);
      logger.info("Property fetched successfully:");
      res.status(200).json( result );
    } catch (error: any) {
      logger.error("Error fetching property by ID:", error.message);
      res.status(404).json({ success: false, message: error.message });
    }
  },

  // Get all properties with pagination & filters
  async getAllProperties(req: Request, res: Response) {
    try {
      const {
        query,
        category,
        listed_for,
        min_price,
        max_price,
        ne_lat,
        ne_lng,
        sw_lat,
        sw_lng,
        cursor = undefined,
      } = req.query;

      const searchQuery = query?.toString().trim() || "";

      // Pagination
      const pageCursor = cursor ? cursor as string : undefined
      /* ---------------- Build Mongo Filter ---------------- */

      const propertyFilter: any = {};

      // ✅ Category
      if (category && category !== "") {
        propertyFilter.category = category;
      }

      // ✅ Listed For
      if (listed_for && listed_for !== "all") {
        propertyFilter.listed_for = listed_for;
      }

      // ✅ Price Range
      const minPrice = min_price ? Number(min_price) : null;
      const maxPrice = max_price ? Number(max_price) : null;

      if (minPrice != null || maxPrice != null) {
        propertyFilter.price = {};

        if (minPrice != null && !Number.isNaN(minPrice)) {
          propertyFilter.price.$gte = minPrice;
        }

        if (maxPrice != null && !Number.isNaN(maxPrice)) {
          propertyFilter.price.$lte = maxPrice;
        }
      }

      // ✅ Chosen location, as tiers from most to least specific:
      //    - postcode=LA-11-U34   Nigerian postcode or prefix (area -> district -> LGA -> state)
      //    - place_country=KE&place_region=..&place_subregion=..&place_area=..   any country, by name
      //    With widen=1 an empty first page falls back to the next tier; `match_tier` and `applied`
      //    in the response say which one was used (send `applied` back for the next page).
      const qs = (k: string) => req.query[k]?.toString().trim() || undefined;
      const postcodeQuery = qs("postcode");
      let locationTiers: TierFilter[] = [];
      if (postcodeQuery) {
        locationTiers = ladderFilters(postcodeQuery);
        if (!locationTiers.length) {
          return res.status(400).json({ success: false, message: "Invalid postcode or prefix" });
        }
      } else if (qs("place_country")) {
        locationTiers = placeLadderFilters({
          country: qs("place_country"),
          region: qs("place_region"),
          subregion: qs("place_subregion"),
          area: qs("place_area"),
        });
      }
      const widen = req.query.widen === "1" && !cursor;

      // ✅ Geo Bounds Filter
      if (ne_lat && ne_lng && sw_lat && sw_lng) {
        propertyFilter.map_location = {
          $geoWithin: {
            $box: [
              [parseFloat(sw_lng as string), parseFloat(sw_lat as string)],
              [parseFloat(ne_lng as string), parseFloat(ne_lat as string)],
            ],
          },
        };
      }

      // await populateUsertype()
      if (!locationTiers.length) {
        const result = await PropertyService.getProperties(searchQuery, propertyFilter, pageCursor);
        return res.status(200).json({ success: true, ...result });
      }

      // A chosen location replaces the map viewport: the client re-centres on the results.
      delete propertyFilter.map_location;

      let matchTier: MatchTier = locationTiers[0].tier;
      let applied = locationTiers[0].filter;
      let result = await PropertyService.getProperties(searchQuery, { ...propertyFilter, ...applied }, pageCursor);
      if (widen) {
        for (const step of locationTiers.slice(1)) {
          if (result.properties.length) break;
          matchTier = step.tier;
          applied = step.filter;
          result = await PropertyService.getProperties(searchQuery, { ...propertyFilter, ...applied }, pageCursor);
        }
      }

      // logger.info("Properties fetched successfully:", result.properties.length);
      return res.status(200).json({
        success: true,
        ...result,
        match_tier: matchTier,
        widened: matchTier !== locationTiers[0].tier,
        applied: describeApplied(applied),
      });
    } catch (error: any) {
      logger.error("Controller Error fetching all properties:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Get all properties with pagination & filters
  async getNearestProperties(req: Request, res: Response) {
    try {
      const {
        query,
        category,
        listed_for,
        min_price,
        max_price,
        lat,
        lng,
        cursor,
      } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({
          success: false,
          message: "Latitude and longitude are required",
        });
      }

      const searchQuery = query?.toString().trim() || "";
      const pageCursor = cursor ? String(cursor) : undefined;

      /* ---------------- Build Filter ---------------- */
      const propertyFilter: any = {};

      if (category && category !== "") {
        propertyFilter.category = category;
      }

      if (listed_for && listed_for !== "all") {
        propertyFilter.listed_for = listed_for;
      }

      const minPrice = min_price ? Number(min_price) : null;
      const maxPrice = max_price ? Number(max_price) : null;

      if (minPrice != null || maxPrice != null) {
        propertyFilter.price = {};
        if (minPrice != null && !Number.isNaN(minPrice)) {
          propertyFilter.price.$gte = minPrice;
        }
        if (maxPrice != null && !Number.isNaN(maxPrice)) {
          propertyFilter.price.$lte = maxPrice;
        }
      }

      /* ---------------- Service Call ---------------- */
      const result = await PropertyService.getNearestProperties({
        lat: Number(lat),
        lng: Number(lng),
        searchQuery,
        filter: propertyFilter,
        cursor: pageCursor,
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error(
        "Controller Error fetching nearest properties:",
        error || error
      );
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Get all properties with pagination & filters
  async getCollocatedProperties(req: Request, res: Response) {
    try {
      const propertyId = req.params.pid;
      // logger.info("Fetching Nearest properties from property ID:", {propertyId});

      const limit = parseInt(req.query.limit as string, 10) || 6;
      const requested = String(req.query.tier ?? "auto");
      const tier = (["area", "district", "subregion", "region", "distance"].includes(requested)
        ? requested
        : "auto") as MatchTier | "auto";

      const { properties, match_tier, tiers } = await PropertyService.getCollocatedProperties(
        propertyId,
        limit,
        tier
      );

      // logger.info("Nearest Properties fetched successfully:", properties.length);
      return res.status(200).json({
        success: true,
        properties,
        match_tier, // which tier these came from
        tiers,      // tiers this listing supports, most specific first
        totalPages: Math.ceil(properties.length / limit),
      });

    } catch (error: any) {
      logger.error("Controller Error fetching all properties:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

    // Get all properties with pagination & filters
  async getUserProperties(req: Request, res: Response) {
    try {
      const currentUser = req.currentUser as IUser;
      // logger.info("Fetching User properties for user ID:", currentUser._id);
      
      const cursor = req.query.cursor ? req.query.cursor as string : undefined;

      const properties = await PropertyService.getUserProperties(
        currentUser,
        cursor
      );

      // logger.info("User Properties fetched successfully:", properties.length);
      return res.status(200).json({
        success: true,
        properties
      });

    } catch (error: any) {
      // logger.error("Controller Error fetching all properties:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Update a property by ID
  async updateProperty(req: Request, res: Response) {
    try {
      // logger.info("Request to update property with ID:", req.params.pid, "Updates:", req.body);
      const propertyId = req.params.pid;
      const formData = req.body;
      // logger.info("property Data to update:", formData);

      // ✅ Parse structured JSON fields
      const parsedFeatures = formData.features
        ? formData.features
        : [];

      const parsedFacilities = formData.env_facilities
        ? formData.env_facilities
        : [];

      const propertyData = {
        ...formData,
        map_location: {
          type: "Point",
          coordinates: [
            parseFloat(formData.longitude as string),
            parseFloat(formData.latitude as string)
          ],
        },
        features: formData.features || [],
        env_facilities: formData.env_facilities || [],
      };

      const updatedProperty = await PropertyService.updateProperty(propertyId, propertyData);
      // logger.info("Property updated successfully:", updatedProperty);
      res.status(200).json(updatedProperty);
    } catch (error: any) {
      logger.error("Error updating property:", error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // Search-box suggestions with listing counts: postcode prefixes (Nigeria) or place names (any country)
  async suggestLocations(req: Request, res: Response) {
    try {
      const q = req.query.q?.toString().trim() ?? "";
      if (q.length < 2 || q.length > 40) {
        return res.status(200).json({ success: true, suggestions: [] });
      }
      const suggestions = await PropertyService.suggestLocations(q);
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(200).json({ success: true, suggestions });
    } catch (error: any) {
      logger.error("Error suggesting locations:", error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Record a Call / Email / Chat tap and return the full postcode (Nigeria only; null elsewhere)
  async recordContact(req: Request, res: Response) {
    try {
      const authUser = req.currentUser as IUser;
      const channel = String(req.body?.channel ?? "");
      if (!["call", "email", "chat"].includes(channel)) {
        return res.status(400).json({ success: false, message: "channel must be call, email or chat" });
      }
      const result = await PropertyService.recordContact(
        req.params.pid,
        authUser,
        channel as "call" | "email" | "chat"
      );
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      logger.error("Error recording property contact:", error.message);
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  // Full postcode: owner, or a user who has already contacted the agent
  async getPostcode(req: Request, res: Response) {
    try {
      const authUser = req.currentUser as IUser;
      const result = await PropertyService.getFullPostcode(req.params.pid, authUser);
      if (!result) {
        return res.status(403).json({
          success: false,
          code: "contact_required",
          message: "Contact the agent to see the exact postcode",
        });
      }
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      logger.error("Error fetching property postcode:", error.message);
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  // Delete a property by ID
  async deleteProperty(req: Request, res: Response) {
    try {
      // logger.info("Request to delete property with ID:", req.params.pid);
      const propertyId = req.params.pid;
      const authUser = req.currentUser as IUser;
      await PropertyService.deleteUserProperty(propertyId, authUser);
      // logger.info("Property deleted successfully:", propertyId);
      res.status(200).json({ success: true, message: "Property deleted successfully." });
    } catch (error: any) {
      logger.error("Error deleting property:", error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  async updatePropertyImage(req: Request, res: Response) {
    try {
      // logger.info("Request to update property image with ID:", req.params.pid);
      const { property_id, image_index } = req.body;
      const file = req.file as Express.Multer.File; 

      if (!property_id || !file) {
        // logger.error("No image file or property ID provided.");
        return res.status(400).json({ success: false, message: "No image file or property ID provided." });
      }
      let imageUrl: string;

      if (image_index===undefined || image_index==="") {
        imageUrl = await PropertyService.updatePropertyImage(property_id, file);
        
      } else {
        imageUrl = await PropertyService.updatePropertyImage(property_id, file, parseInt(image_index, 10));
      }

      // logger.info("Property image updated successfully:", {imageUrl});
      res.status(200).json({ success: true, image: imageUrl });
    } catch (error: any) {
      // logger.error("Error updating property image:", error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  async deletePropertyImage(req: Request, res: Response) {
    try {
      const { property_id, image_url} = req.body;
      // logger.info("Request to delete property image with ID:", property_id, "Image URL:", image_url);      

      if (!image_url || !property_id) {
        return res.status(400).json({ success: false, message: "No image URL or property ID provided." });
      }

      const updatedProperty = await PropertyService.deletePropertyImage(property_id, image_url);
      // logger.info("Property image deleted successfully:", {updatedProperty});

      res.status(200).json({ success: true, property: updatedProperty });
    } catch (error: any) {
      // logger.error("Error deleting property image:", error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default PropertyController;
