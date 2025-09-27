import logger from "../config/loggingConfig";
import Property from "../models/property";
import { IProperty } from "../types";
import { PipelineStage, FilterQuery, UpdateQuery } from "mongoose";

class PropertyService {
  // Create a new property
  async createProperty(propertyData: IProperty): Promise<IProperty> {
    try {
      const property = new Property(propertyData);
      return await property.save();
    } catch (error: any) {
      throw new Error(`Failed to create property: ${error.message}`);
    }
  }

  // Get a single property by its ID
  async getPropertyById(propertyId: string): Promise<IProperty | null> {
    try {
      return await Property.findById(propertyId).populate("agent").exec();
    } catch (error: any) {
      throw new Error(`Failed to retrieve property with ID ${propertyId}: ${error.message}`);
    }
  }

  // Get a list of properties based on a filter
  async getProperties(
    skip: number,
    pageSize: number,
    filter: FilterQuery<IProperty> = {}
  ): Promise<any[]> {
    try {
      const pipeline: PipelineStage[] = [
        { $match: filter },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: pageSize },
        {
          $lookup: {
            from: "users", // must match your "Agent" collection name in Mongo
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $project: {
            id: "$_id", // rename
            _id: 0,     // hide default _id
            title: 1,
            price: 1,
            address: 1,
            banner: 1,
            listed_for: 1,
            period: 1,
            // user: 1,

            // ✅ Extract GeoJSON [lng, lat] into fields
            longitude: { $arrayElemAt: ["$map_location.coordinates", 0] },
            latitude: { $arrayElemAt: ["$map_location.coordinates", 1] },

            // ✅ only pick the needed user fields
            // "user.id": "$user._id",
            // "user._id": 0, // optional, hide raw Mongo _id
            
            "user.username": 1,
          },
        },
      ];

      const properties = await Property.aggregate(pipeline).exec();
      logger.info("fetched properties", properties.length);
      return properties;
    } catch (error: any) {
      throw new Error(`Failed to retrieve properties: ${error.message}`);
    }
  }

  // Update a property by its ID
  async updateProperty(propertyId: string, updateData: UpdateQuery<IProperty>): Promise<IProperty | null> {
    try {
      const updatedProperty = await Property.findByIdAndUpdate(
        propertyId,
        { ...updateData, updated_at: new Date() },
        { new: true, runValidators: true }
      ).exec();

      if (!updatedProperty) {
        throw new Error(`Property with ID ${propertyId} not found`);
      }

      return updatedProperty;
    } catch (error: any) {
      throw new Error(`Failed to update property with ID ${propertyId}: ${error.message}`);
    }
  }

  // Delete a property by its ID
  async deleteProperty(propertyId: string): Promise<void> {
    try {
      const result = await Property.findByIdAndDelete(propertyId).exec();

      if (!result) {
        throw new Error(`Property with ID ${propertyId} not found`);
      }
    } catch (error: any) {
      throw new Error(`Failed to delete property with ID ${propertyId}: ${error.message}`);
    }
  }
}

export default new PropertyService();
