export const extractPublicId = (url: string): string | null => {
  try {
    const cleanUrl = url.split("?")[0];
    const parts = cleanUrl.split("/");

    const uploadIndex = parts.findIndex((p) => p === "upload");
    if (uploadIndex === -1) return null;

    // Remove version number e.g. v1760977246
    const withFolder = parts.slice(uploadIndex + 2).join("/");

    // Remove file extension
    return withFolder.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
};
