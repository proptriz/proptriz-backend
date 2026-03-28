import { Document, Types } from "mongoose";
import { CategoryEnum } from "./models/enums/CategoryEnum";
import { CurrencyEnum } from "./models/enums/CurrencyEnum";
import { LeanWithId } from "./helpers/leanWithId";
import { UserType } from "./models/user";
import { LandmarkCategoryEnum } from "./models/enums/LandmarkCategoryEnum";

export interface BaseDocument extends Document {
  _id: Types.ObjectId;
}

export interface IUser extends LeanWithId<UserType>{}; 

export interface IAuthIdentity extends Document {
  _id : Types.ObjectId;
  user_id: Types.ObjectId;            // references User._id
  provider: "pi" | "google" | "apple" | "facebook";
  provider_user_id: string;   // pi_uid OR google.sub
  username: string;           // optional (Pi username)
  email: string;              // optional
  email_verified: boolean;
  createdAt: Date;
};


export interface A2UMetadata { 
  orderId: string; 
  sellerId: string; 
  buyerId: string 
};

export interface PaymentInfo {
  identifier: string;
  transaction?: {
    txid: string;
    _link: string;
  };
};

export interface PaymentDTO {
  amount: number;
  user_uid: string;
  created_at: string;
  identifier: string;
  memo: string;
  metadata: object;
  status: {
    developer_approved: boolean;
    transaction_verified: boolean;
    developer_completed: boolean;
    cancelled: boolean;
    user_cancelled: boolean;
  },
  to_address: string;
  transaction: null | {
    txid: string;
    verified: boolean;
    _link: string;
  },
};

export interface IA2UJob extends Document {
  sellerPiUid: string;
  amount: number;
  xRef_ids: string[];
  memo: string,
  status: 'pending' | 'processing' | 'completed' | 'failed';
  last_a2u_date: Date,
  attempts: number;
  last_error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface A2UPaymentDataType {
  sellerPiUid: string,
  amount: string,
  xRefIds: string[],
  memo: string
};

// export interface UserType extends Pick<IUser, "username"| "fullname" | "email" | "phone"| "image" > {}

export interface IProperty extends BaseDocument {
  id?: string,
  banner: string; // URL of the property image or image with index = 0
  title: string; // Title of the property (e.g. 3 bedroom flat, self contain, )
  slug: string;
  address: string; // Location of the property
  price: number; // Price per month
  currency: CurrencyEnum; // Currency type (e.g. NGN, USD, GBP)
  listed_for: string; // (e.g. "sell"/ "rent")
  category: CategoryEnum; // The class of property (e.g. house, land, shop, office, hotel )
  period?: string; // if is for rent, payment period (e.g monthly, yearly, daily)
  negotiable: boolean; // (true/false)
  description: string;
  duration: number;
  expired_by: Date;
  average_rating: number;
  review_count: number;
  images: string[]; //Other property images for gallery
  user: Types.ObjectId; //foreign key representing agent that list the property
  username: string;
  map_location?: {
    type: 'Point';
    coordinates: [number, number];
  };
  features?: [{
      name: string;
      quantity: number;
  }];
  env_facilities?: string[];
  status: string; // (available, sold, unavailable, rented)
};

  export interface IAgent extends Document { 
    user: Types.ObjectId; //foreign key 
    brand_name: string; // User Legal Name (e.g. Tony Adeola Ezenwa)
    image: string; // URL to user profile pics (optional)
    fulfillment_terms: string;
    address: string;
    map_location?: {
      type: 'Point';
      coordinates: [number, number];
    };
    status: string; // (available, unavilable)
    social_handles: Types.Map<string>;
  };

  export interface IAgentReview extends Document {
    rating: number; // Rating score (0.0 to 5.0)
    comment?: string; // user review text (optional)
    review_giver: Types.ObjectId; // Foreing key referencing userId
    review_receiver: Types.ObjectId; // Foreign key referencing property under review
    reply_review_id: Types.ObjectId; // Foreign id ref to review
    images?: string[]; // URLs of reviewer upload (optional)
  };

export interface ILandmark extends Document {
  property:         Types.ObjectId;
  name:         string;
  category:     LandmarkCategoryEnum;
  map_location: {
    type:        string;
    coordinates: number[];  // [longitude, latitude] — GeoJSON order
  };
  createdAt:    Date;
  updatedAt:    Date;
}