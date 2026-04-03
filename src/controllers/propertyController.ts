import { Request, Response } from "express";
import PropertyService from "../services/property.service";
import logger from "../config/loggingConfig";
import { IUser } from "../types";
import runExtractProperty from "../utils/extractProperty";
// import {populateUsertype} from "../../scripts/propMigrations"

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
        propertyData: property,
      });
      
    } catch (error: any) {
      logger.error("Error extracting property data:", error.message, error.stack);
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
      const result = await PropertyService.getProperties(
        searchQuery,
        propertyFilter,
        pageCursor
      );

      logger.info("Properties fetched successfully:", result.properties.length);
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error("Controller Error fetching all properties:", error.message || error);
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
      logger.info("Fetching Nearest properties from property ID:", {propertyId});

      const limit = parseInt(req.query.limit as string, 10) || 6;

      const properties = await PropertyService.getCollocatedProperties(
        propertyId,
        limit
      );

      logger.info("Nearest Properties fetched successfully:", properties.length);
      return res.status(200).json({
        success: true,
        properties,
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
      logger.info("Fetching User properties for user ID:", currentUser._id);
      
      const cursor = req.query.cursor ? req.query.cursor as string : undefined;

      const properties = await PropertyService.getUserProperties(
        currentUser,
        cursor
      );

      logger.info("User Properties fetched successfully:", properties.length);
      return res.status(200).json({
        success: true,
        properties
      });

    } catch (error: any) {
      logger.error("Controller Error fetching all properties:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Update a property by ID
  async updateProperty(req: Request, res: Response) {
    try {
      logger.info("Request to update property with ID:", req.params.pid, "Updates:", req.body);
      const propertyId = req.params.pid;
      const formData = req.body;
      logger.info("property Data to update:", formData);

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

  // Delete a property by ID
  async deleteProperty(req: Request, res: Response) {
    try {
      logger.info("Request to delete property with ID:", req.params.pid);
      const propertyId = req.params.pid;
      const authUser = req.currentUser as IUser;
      await PropertyService.deleteUserProperty(propertyId, authUser);
      logger.info("Property deleted successfully:", propertyId);
      res.status(200).json({ success: true, message: "Property deleted successfully." });
    } catch (error: any) {
      logger.error("Error deleting property:", error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  async updatePropertyImage(req: Request, res: Response) {
    try {
      logger.info("Request to update property image with ID:", req.params.pid);
      const { property_id, image_index } = req.body;
      const file = req.file as Express.Multer.File; 

      if (!property_id || !file) {
        logger.error("No image file or property ID provided.");
        return res.status(400).json({ success: false, message: "No image file or property ID provided." });
      }
      let imageUrl: string;

      if (image_index===undefined || image_index==="") {
        imageUrl = await PropertyService.updatePropertyImage(property_id, file);
        
      } else {
        imageUrl = await PropertyService.updatePropertyImage(property_id, file, parseInt(image_index, 10));
      }

      logger.info("Property image updated successfully:", {imageUrl});
      res.status(200).json({ success: true, image: imageUrl });
    } catch (error: any) {
      logger.error("Error updating property image:", error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  async deletePropertyImage(req: Request, res: Response) {
    try {
      const { property_id, image_url} = req.body;
      logger.info("Request to delete property image with ID:", property_id, "Image URL:", image_url);      

      if (!image_url || !property_id) {
        return res.status(400).json({ success: false, message: "No image URL or property ID provided." });
      }

      const updatedProperty = await PropertyService.deletePropertyImage(property_id, image_url);
      logger.info("Property image deleted successfully:", {updatedProperty});

      res.status(200).json({ success: true, property: updatedProperty });
    } catch (error: any) {
      logger.error("Error deleting property image:", error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default PropertyController;
