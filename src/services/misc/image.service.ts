import cloudinary from '../../config/cloudinary';
import logger from '../../config/loggingConfig';

/**
 * Upload single or multiple images to Cloudinary
 * @param publicIdPrefix - Prefix for public_id (can include unique identifiers)
 * @param files - Single file or array of files
 * @param folder - Folder path array, e.g. ['properties', 'images']
 * @returns Array of uploaded image URLs
 */
export const uploadImages = async (
  publicIdPrefix: string,
  files: Express.Multer.File | Express.Multer.File[],
  folder: string[]
): Promise<string[]> => {
  try {
    const fileArray = Array.isArray(files) ? files : [files];
    const folderPath = folder.join('/');

    logger.info(`Uploading ${fileArray.length} image(s) to Cloudinary folder: ${folderPath}`);

    const uploadPromises = fileArray.map((file, index) => {
      const publicId = `${publicIdPrefix}_${index + 1}`;

      return cloudinary.uploader.upload(file.path, {
        folder: folderPath,
        public_id: publicId,
        resource_type: 'image',
        overwrite: true,
      });
    });

    const results = await Promise.all(uploadPromises);

    logger.info('All images uploaded successfully');
    return results.map((r) => r.secure_url);
  } catch (error: any) {
    logger.error(`Failed to upload images: ${error.message || error}`);
    throw error;
  }
};

