import { v2 as cloudinary } from "cloudinary";
import logger from "../../config/loggingConfig";
import { extractPublicId } from "../../helpers/extractImagePublicId";

export const uploadToCloudinary = async (
  fileBuffer: Buffer,
  folder: string,
  publicId?: string
): Promise<string> => {
  const base64 = `data:image/jpeg;base64,${fileBuffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(base64, {
    folder,
    public_id: publicId,
    resource_type: "auto",
    overwrite: true,
  });
  return result.secure_url;
};

export const deleteFromCloudinary = async (imageUrls: string[]): Promise<void> => {
  try {
    if (imageUrls.length === 0) return;

    const imagePublicIds = imageUrls.map((url) => extractPublicId(url)).filter(Boolean) as string[];
  
    await cloudinary.api.delete_resources(imagePublicIds, { resource_type: "image" });
    logger.info(`Deleted ${imagePublicIds.length} images from Cloudinary.`);
    
  } catch (error) {
    logger.error("Error deleting images from Cloudinary:", error);
  }
  
}
