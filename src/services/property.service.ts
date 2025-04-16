import Property from "../models/property";
import { IProperty } from "../types";
import { FilterQuery, UpdateQuery } from "mongoose";

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
  async getProperties(skip:number, pageSize:number, filter: FilterQuery<IProperty> = {}): Promise<IProperty[]> {
    try {
      const properties = await Property.find(filter)
      .populate("agent")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .exec();
      // console.log(properties)
      return properties
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
