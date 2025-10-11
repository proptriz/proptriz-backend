import { Request, Response } from "express";
import PropertyService from "../services/property.service";
import logger from "../config/loggingConfig";
// import dropCollection from "../../scripts/dropTable"

const PropertyController = {
  // Add a new property
  async addProperty(req: Request, res: Response) {
    try {
      logger.info("Request to create property:", req.body);
      const propertyData = req.body;
      const property = await PropertyService.createProperty(propertyData);
      logger.info("Property created successfully:", property);
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
      logger.info("Property fetched successfully:", property);
      res.status(200).json( property );
    } catch (error: any) {
      logger.error("Error fetching property by ID:", error.message);
      res.status(404).json({ success: false, message: error.message });
    }
  },

  // Get all properties with pagination & filters
  // Controller
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
