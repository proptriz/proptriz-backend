export const extractPublicId = (url: string): string | null => {
  try {
    // Example: https://res.cloudinary.com/demo/image/upload/v12345/propTriz/properties/slug-1.jpg
    const parts = url.split("/");
    const folderIndex = parts.findIndex((p) => p === "upload") + 1;
    const publicIdWithExt = parts.slice(folderIndex).join("/"); // e.g. propTriz/properties/slug-1.jpg
      return publicIdWithExt.replace(/\.[^/.]+$/, ""); // remove .jpg/.png
    } catch {
      return null;
    }
  };