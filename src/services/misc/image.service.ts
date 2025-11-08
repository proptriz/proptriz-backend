import { v2 as cloudinary } from "cloudinary";
// import streamifier from "streamifier";
// import logger from "../../config/loggingConfig";

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
