import logger from "../config/loggingConfig";
import { buildHybridSearchCriteria } from "../helpers/buildFilter";
import Property from "../models/property";
import { IProperty, IUser } from "../types";
import { PipelineStage, FilterQuery, UpdateQuery } from "mongoose";
import { deleteFromCloudinary, uploadToCloudinary } from "./misc/image.service";
import { ListForEnum } from "../models/enums/ListForEnum";
import UserSettings, { UserSettingsType } from "../models/userSettings";
import { PropertyStatusEnum } from "../models/enums/PropertyStatusEnum";

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

      // ✅ Create base property object
      const property = new Property({
        ...propertyData,
        period: propertyData.listed_for === ListForEnum.rent ? propertyData.period : null,
        price: parseFloat(propertyData.price),
        duration: duration,
        expired_by: expiredBy,
        user: authUser._id,
        username: authUser.username,
        map_location: {
          type: "Point",
          coordinates: prop_cord,
        },
        features: propertyData.features || [],
        env_facilities: propertyData.env_facilities || [],
      });

      // ✅ Step 1: Save first to trigger pre-save hook for slug
      const savedProperty = await property.save();
      logger.info(`Property base saved with slug:, ${savedProperty.slug}`);

      // ✅ Step 2: Now upload images using slug
      if (propertyData.files && propertyData.files.length > 0) {
        const imageUrls: string[] = [];
        
        for (const [index, file] of propertyData.files.entries()) {
          const url = await uploadToCloudinary(
            file.buffer,
            `propTriz/${savedProperty.category}`,
            `${savedProperty.slug}-${savedProperty.images.length + 1}`
          );
          imageUrls.push(url);
        }

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
        .select('username user_type image brand email phone whatsapp social_handles -_id')
        .lean();

      logger.info("fetched owner:", { userDetails });
      return { property: property as IProperty, userDetails: userDetails as UserSettingsType | null };
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
      const now = new Date();

      const pipeline: PipelineStage[] = [
        {
          $match: {
            ...filter,
            ...searchCriteria, // ✅ Correct merge inside $match
            status: PropertyStatusEnum.available, // or PropertyStatus.ACTIVE
            expired_by: {
              $gt: now, // non-expired listings only
            },
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: pageSize },
        
        {
          $project: {
            id: "$_id",
            _id: 0,
            title: 1,
            category: 1,
            price: 1,
            address: 1,
            banner: 1,
            listed_for: 1,
            currency: 1,
            period: 1,
            average_rating: 1,
            longitude: { $arrayElemAt: ["$map_location.coordinates", 0] },
            latitude: { $arrayElemAt: ["$map_location.coordinates", 1] },
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
      const now = new Date();

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

            query: { 
              _id: { $ne: targetProperty._id },
              status: PropertyStatusEnum.available,
              expired_by: { $gt: now }, 
            }, // exclude itself and return only available, non-expired properties
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
            currency: 1,
            price: 1,
            category: 1,
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

  // Get a list of properties based on a filter
  async getUserProperties(
    authUser: IUser,
    skip: number,
    pageSize: number,
  ): Promise<any[]> {
    try {
      logger.info("getting user listed prop");

      const pipeline: PipelineStage[] = [
        {
          $match: {
            user: authUser._id,
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
            category: 1,
            price: 1,
            currency: 1,
            address: 1,
            banner: 1,
            listed_for: 1,
            expired_by: 1,
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

      const updatedProperty = await Property.findByIdAndUpdate(
        propertyId,
        { ...updateData, 
          period: updateData.listed_for === ListForEnum.rent ? updateData.period : null,
          price: parseFloat(updateData.price),
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
