import { Types } from "mongoose";

export type LeanWithId<T> = T & {
  _id: Types.ObjectId;
};
