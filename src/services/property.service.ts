import logger from "../config/loggingConfig";
import { buildHybridSearchCriteria } from "../helpers/buildFilter";
import Property from "../models/property";
import { IProperty, IUser } from "../types";
import { PipelineStage, FilterQuery, UpdateQuery } from "mongoose";
import { uploadToCloudinary } from "./misc/image.service";

class PropertyService {
  // Create a new property
  async createProperty(authUser: IUser, propertyData: any): Promise<IProperty> {
    try {
      logger.info("Service log: creating property", { propertyData });

      // ✅ Coordinates
      const prop_cord =
        propertyData.latitude && propertyData.longitude
          ? [parseFloat(propertyData.longitude), parseFloat(propertyData.latitude)]
          : [0, 0];

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

      // ✅ Step 1: Save first to trigger pre-save hook for slug
      const savedProperty = await property.save();
      logger.info("Property base saved with slug:", savedProperty.slug);

      // ✅ Step 2: Now upload images using slug
      if (propertyData.files && propertyData.files.length > 0) {
        const uploadPromises = propertyData.files.map(
          async (file: Express.Multer.File, index: number) => {
            return uploadToCloudinary(
              file.buffer,
              `propTriz/properties/${savedProperty.category}`,
              `${savedProperty.slug}-${index + 1}`
            );
          }
        );

        const imageUrls = await Promise.all(uploadPromises);

        // ✅ Step 3: Update banner and images
        if (imageUrls.length > 0) {
          savedProperty.banner = imageUrls[0];
          savedProperty.images = imageUrls;
          await savedProperty.save(); // update with images
        }
      }

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
      const property = await Property.findById(propertyId).populate('user').lean();
      if (property) {
        return property
      } 
      return null
      
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

  async getNearestProperties(
  propertyId: string,
  limit: number = 4
): Promise<any[]> {
  try {
    // 1️⃣ Find the property to get its coordinates
    const targetProperty = await Property.findById(propertyId).select("map_location").lean();

    if (!targetProperty || !targetProperty.map_location?.coordinates) {
      throw new Error("Property location not found");
    }

    const [lng, lat] = targetProperty.map_location.coordinates;

    // 2️⃣ Run geo aggregation to find nearby properties
    const pipeline: PipelineStage[] = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lng, lat] },
          distanceField: "distance",
          spherical: true,
          key: "map_location",
          query: { _id: { $ne: targetProperty._id } }, // exclude itself
        },
      },
      { $sort: { distance: 1 } },
      { $limit: limit },
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
          distance: 1,
          longitude: { $arrayElemAt: ["$map_location.coordinates", 0] },
          latitude: { $arrayElemAt: ["$map_location.coordinates", 1] },
          "user.username": 1,
        },
      },
    ];

    const nearestProperties = await Property.aggregate(pipeline).exec();
    return nearestProperties;
  } catch (error: any) {
    throw new Error(`Failed to find nearest properties: ${error.message}`);
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
