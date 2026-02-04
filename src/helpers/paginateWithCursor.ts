import { encodeCursor } from "./cursor";
import { Types } from "mongoose";

function paginateWithCursor<T extends { createdAt: Date; _id: Types.ObjectId }>(
  items: T[],
  limit: number
) {
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;

  return {
    page,
    nextCursor: hasMore
      ? encodeCursor(page[page.length - 1])
      : null
  };
}

export default paginateWithCursor
