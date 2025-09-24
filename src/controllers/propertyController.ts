import { Request, Response } from "express";
import PropertyService from "../services/property.service";

const PropertyController = {
  // Add a new property
  async addProperty(req: Request, res: Response) {
    try {
      console.log("Request to create property:", req.body);
      const propertyData = req.body;
      const property = await PropertyService.createProperty(propertyData);
      console.log("Property created successfully:", property);
      res.status(201).json({ success: true, data: property });
    } catch (error: any) {
      console.error("Error creating property:", error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // Get a property by ID
  async getPropertyById(req: Request, res: Response) {
    try {
      console.log("Fetching property with ID:", req.params.pid);
      const propertyId = req.params.pid;
      const property = await PropertyService.getPropertyById(propertyId);
      console.log("Property fetched successfully:", property);
      res.status(200).json( property );
    } catch (error: any) {
      console.error("Error fetching property by ID:", error.message);
      res.status(404).json({ success: false, message: error.message });
    }
  },

  // Get all properties with pagination & filters
  async getAllProperties(req: Request, res: Response) {
    try {
      console.log("Fetching all properties with filters:", req.query);

      // Parse pagination values from query
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const skip = (page - 1) * limit;

      // Parse filters safely
      let filters = {};
      if (req.query.filters) {
        try {
          filters = JSON.parse(req.query.filters as string);
        } catch (error) {
          return res.status(400).json({ success: false, message: "Invalid filters format" });
        }
      }

      // Fetch properties with pagination & filters
      const properties = await PropertyService.getProperties(skip, limit, filters);

      console.log("Properties fetched successfully:", properties.length);
      return res.status(200).json({
        success: true,
        properties: properties,
        currentPage: page,
        totalPages: Math.ceil(properties.length / limit),
      });

    } catch (error: any) {
      console.error("Error fetching all properties:", error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Update a property by ID
  async updateProperty(req: Request, res: Response) {
    try {
      console.log("Request to update property with ID:", req.params.id, "Updates:", req.body);
      const propertyId = req.params.id;
      const updates = req.body;
      const updatedProperty = await PropertyService.updateProperty(propertyId, updates);
      console.log("Property updated successfully:", updatedProperty);
      res.status(200).json({ success: true, data: updatedProperty });
    } catch (error: any) {
      console.error("Error updating property:", error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // Delete a property by ID
  async deleteProperty(req: Request, res: Response) {
    try {
      console.log("Request to delete property with ID:", req.params.id);
      const propertyId = req.params.id;
      await PropertyService.deleteProperty(propertyId);
      console.log("Property deleted successfully:", propertyId);
      res.status(200).json({ success: true, message: "Property deleted successfully." });
    } catch (error: any) {
      console.error("Error deleting property:", error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default PropertyController;
