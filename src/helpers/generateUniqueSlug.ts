import slugify from "slugify";
import { Model, Document, Types } from "mongoose";

/**
 * Generate a unique slug for a Mongoose document
 * @param model - The mongoose model to check against
 * @param title - The source string to slugify
 * @param excludeId - Optional: exclude a document (useful on updates)
 * @returns unique slug string
 */
export async function generateUniqueSlug<T extends Document>(
  model: Model<T>,
  title: string,
  excludeId?: string | Types.ObjectId
): Promise<string> {
  const baseSlug = slugify(title, { lower: true, strict: true });
  let slug = baseSlug;
  let counter = 1;

  const query: any = { slug };
  if (excludeId) {
    query._id = { $ne: excludeId }; // exclude current doc when updating
  }

  while (await model.exists(query)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
    query.slug = slug;
  }

  return slug;
}
