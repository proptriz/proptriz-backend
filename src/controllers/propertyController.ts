import e, { Request, Response } from "express";
import PropertyService from "../services/property.service";
import logger from "../config/loggingConfig";
import { IUser } from "../types";
// import dropCollection from "../../scripts/dropTable"

const PropertyController = {
  
  // Add a new property
  async addProperty(req: Request, res: Response) {
    try {
      const authUser = req.currentUser as IUser;
      const formData = req.body;
      const files = req.files as Express.Multer.File[];

      // ✅ Log only the keys of formData, not full content
      // logger.debug("Received property formData keys:", Object.keys(formData));

      // ✅ Image validation
      if (!files || files.length === 0)
        return res.status(400).json({ message: "No images uploaded" });

      if (files.length > 5)
        return res.status(400).json({ message: "Maximum 5 images allowed" });

      // ✅ Log minimal file info — exclude Buffer
      const fileInfo = files.map(f => ({
        originalname: f.originalname,
        mimetype: f.mimetype,
        sizeKB: Math.round(f.size / 1024),
      }));
      logger.info("Uploaded files metadata:", fileInfo);

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
        env_facilities: parsedFacilities,
        files,
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
        data: property,
      });
    } catch (error: any) {
      logger.error("Error creating property:", error.message, error.stack);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to create property",
      });
    }
  },

  // Get a property by ID
  async getPropertyById(req: Request, res: Response) {
    try {
      logger.info("Fetching property with ID:", req.params.pid);
      const propertyId = req.params.pid;
      const property = await PropertyService.getPropertyById(propertyId);
      logger.info("Property fetched successfully:");
      res.status(200).json( property );
    } catch (error: any) {
      logger.error("Error fetching property by ID:", error.message);
      res.status(404).json({ success: false, message: error.message });
    }
  },

  // Get all properties with pagination & filters
  async getAllProperties(req: Request, res: Response) {
    try {
      const { query, category, ne_lat, ne_lng, sw_lat, sw_lng } = req.query;

      let boundsFilter: any = {};
      const searchQuery = query?.toString().trim() || '';

      // ✅ Build bounds filter correctly
      if (category || (ne_lat && ne_lng && sw_lat && sw_lng)) {
        boundsFilter = {
          ...(category && { category }),
          ...(ne_lat &&
            ne_lng &&
            sw_lat &&
            sw_lng && {
              map_location: {
                $geoWithin: {
                  $box: [
                    [parseFloat(sw_lng as string), parseFloat(sw_lat as string)], // bottom-left
                    [parseFloat(ne_lng as string), parseFloat(ne_lat as string)], // top-right
                  ],
                },
              },
            }),
        };
      }

      // Pagination
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const skip = (page - 1) * limit;

      const properties = await PropertyService.getProperties(
        skip,
        limit,
        searchQuery,
        boundsFilter
      );

      logger.info("Properties fetched successfully:", properties.length);
      return res.status(200).json({
        success: true,
        properties,
        currentPage: page,
        totalPages: Math.ceil(properties.length / limit),
      });
    } catch (error: any) {
      logger.error("Controller Error fetching all properties:", error.message || error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Get all properties with pagination & filters
  async getNearestProperties(req: Request, res: Response) {
    try {
      const propertyId = req.params.pid;
      logger.info("Fetching Nearest properties from property ID:", {propertyId});

      const limit = parseInt(req.query.limit as string, 10) || 6;

      const properties = await PropertyService.getNearestProperties(
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

      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const skip = (page - 1) * limit;

      const properties = await PropertyService.getUserProperties(
        currentUser,
        skip,
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

  // Update a property by ID
  async updateProperty(req: Request, res: Response) {
    try {
      logger.info("Request to update property with ID:", req.params.pid, "Updates:", req.body);
      const propertyId = req.params.pid;
      const updates = req.body;
      logger.info("property Data to update:", updates);
      const updatedProperty = await PropertyService.updateProperty(propertyId, updates);
      // logger.info("Property updated successfully:", updatedProperty);
      res.status(200).json({ success: true, data: updatedProperty });
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
