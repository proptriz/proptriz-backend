import logger from "../config/loggingConfig";
import { buildHybridSearchCriteria } from "../helpers/buildFilter";
import Property from "../models/property";
import { IProperty, IUser } from "../types";
import { PipelineStage, FilterQuery, UpdateQuery } from "mongoose";
import { uploadImages } from "./misc/image.service";

class PropertyService {
  // Create a new property
  async createProperty(authUser: IUser, propertyData: any): Promise<IProperty> {
    try {
      // const { title, price, latitude, longitude, features, env_facilities } = propertyData;
      logger.info("Service log: creating property", { propertyData });

      // ✅ Set coordinates safely
      const prop_cord =
        propertyData.latitude && propertyData.longitude ? [parseFloat(propertyData.longitude), parseFloat(propertyData.latitude)] : [0, 0];

      // ✅ Create base property object
      const property = new Property({
        ...propertyData,
        price: parseFloat(propertyData.price),
        user: authUser._id,
        map_location: {
          type: "Point",
          coordinates: prop_cord,
        },
        features: propertyData.features || [],
        env_facilities: propertyData.env_facilities || [],
      });

      // ✅ Handle image upload if file(s) exist
      let uploadedImages: string[] = [];
      if (propertyData.files && propertyData.files.length > 0) {
        uploadedImages = await uploadImages(
          property.slug,
          propertyData.files as Express.Multer.File[],
          ['properties', propertyData.category]
          
        );
      }

      // ✅ Assign images properly
      if (uploadedImages.length > 0) {
        property.banner = uploadedImages[0];
        property.images = uploadedImages;
      }

      const savedProperty = await property.save();
      logger.info("Property created successfully:", savedProperty._id);

      return savedProperty;
    } catch (error: any) {
      logger.error("Error in PropertyService.createProperty:", error.message);
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
    search_query: string,
    filter: FilterQuery<IProperty> = {}
  ): Promise<any[]> {
    try {
      // Build text/multi-field search
      // ✅ Merge filters safely
      const searchCriteria = buildHybridSearchCriteria(search_query);
      logger.info("search query:", JSON.stringify(searchCriteria, null, 2));

      const pipeline: PipelineStage[] = [
        {
          $match: {
            ...filter,
            ...searchCriteria, // ✅ Correct merge inside $match
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: pageSize },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $project: {
            id: "$_id",
            _id: 0,
            title: 1,
            price: 1,
            address: 1,
            banner: 1,
            listed_for: 1,
            period: 1,
            longitude: { $arrayElemAt: ["$map_location.coordinates", 0] },
            latitude: { $arrayElemAt: ["$map_location.coordinates", 1] },
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
