import { Request, Response } from "express";
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

      logger.debug("Received formData for registration:", { formData });

      if (!files || files.length === 0)
        return res.status(400).json({ message: "No images uploaded" });

      if (files.length > 5)
        return res.status(400).json({ message: "Maximum 5 images allowed" });

      logger.info("Property data:", { formData });
      logger.info("Uploaded files:", files.map(f => f.originalname));

      // ✅ Pass both form data and files
      const property = await PropertyService.createProperty(
        authUser, 
        {
          ...formData,
          files,
        }
    );

      logger.info("Property created successfully:", property._id);
      res.status(201).json({ success: true, data: property });
    } catch (error: any) {
      logger.error("Error creating property:", error.message);
      res.status(400).json({ success: false, message: error.message });
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

  // Update a property by ID
  async updateProperty(req: Request, res: Response) {
    try {
      logger.info("Request to update property with ID:", req.params.id, "Updates:", req.body);
      const propertyId = req.params.id;
      const updates = req.body;
      const updatedProperty = await PropertyService.updateProperty(propertyId, updates);
      logger.info("Property updated successfully:", updatedProperty);
      res.status(200).json({ success: true, data: updatedProperty });
    } catch (error: any) {
      logger.error("Error updating property:", error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // Delete a property by ID
  async deleteProperty(req: Request, res: Response) {
    try {
      logger.info("Request to delete property with ID:", req.params.id);
      const propertyId = req.params.id;
      await PropertyService.deleteProperty(propertyId);
      logger.info("Property deleted successfully:", propertyId);
      res.status(200).json({ success: true, message: "Property deleted successfully." });
    } catch (error: any) {
      logger.error("Error deleting property:", error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default PropertyController;
