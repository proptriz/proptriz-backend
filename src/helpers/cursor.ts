export const encodeCursor = (value: string) =>
  Buffer.from(value).toString("base64");

export const decodeCursor = (cursor: string) =>
  Buffer.from(cursor, "base64").toString("utf8");
