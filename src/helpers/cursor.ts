import mongoose from "mongoose";

export const encodeCursor = (doc: { createdAt: Date; _id: mongoose.Types.ObjectId }) => {
  return Buffer.from(
    `${doc.createdAt.toISOString()}_${doc._id.toString()}`
  ).toString("base64");
};

export const decodeCursor = (cursor?: string) => {
  if (!cursor) return {};

  const decoded = Buffer.from(cursor, "base64").toString("utf8");
  const [createdAtRaw, idRaw] = decoded.split("_");

  if (!createdAtRaw || !mongoose.Types.ObjectId.isValid(idRaw)) {
    return {};
  }

  return {
    $or: [
      { createdAt: { $lt: new Date(createdAtRaw) } },
      {
        createdAt: new Date(createdAtRaw),
        _id: { $lt: new mongoose.Types.ObjectId(idRaw) }
      }
    ]
  };
};
