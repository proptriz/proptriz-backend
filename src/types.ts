import { Document, Types } from "mongoose";
import { CategoryEnum } from "./models/enums/CategoryEnum";

export interface BaseDocument extends Document {
  _id: Types.ObjectId;
}
export interface IUser extends Document {
    username: string; // unique identifyer
    pi_uid: string; // hashed user password
    fullname?: string; // User Legal Name (e.g. Tony Adeola Ezenwa) (optional)
    image?: string; // URL to user profile pics (optional)
    email?: string; // for notification
    phone?: string; // user phone number (optional)
    provider?: string; // URLs of reviewer upload (optional)
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

export interface UserType extends Pick<IUser, "username"| "fullname" | "email" | "phone"| "image" > {}

export interface IProperty extends BaseDocument {
    banner: string; // URL of the property image or image with index = 0
    title: string; // Title of the property (e.g. 3 bedroom flat, self contain, )
    slug: string;
    address: string; // Location of the property
    price: number; // Price per month
    listed_for: string; // (e.g. "sell"/ "rent")
    category: CategoryEnum; // The class of property (e.g. house, land, shop, office, hotel )
    period?: string; // if is for rent, payment period (e.g monthly, yearly, daily)
    negotiable: boolean; // (true/false)
    property_terms?: string // agent terms and condit
    images: string[]; //Other property images for gallery
    user: Types.ObjectId; //foreign key representing agent that list the property
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

  export interface IPropertyReview extends Document {
    rating: number; // Rating score (0.0 to 5.0)
    comment?: string; // user review text (optional)
    review_giver: Types.ObjectId; // Foreing key referencing userId
    property: Types.ObjectId; // Foreing key referencing property under review
    images?: string[]; // URLs of reviewer upload (optional)
    reply_review_id: Types.ObjectId; // Foreign id ref to review
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
    title: string // what the landmark is called
    property: Types.ObjectId; // Foreing key referencing property
    image?: string,
    distance: number; // how far from referenced property (in km)
    position_description: string, // derived from LocationProps
    map_location?: {
      type: 'Point';
      coordinates: [number, number];
    };
    created_at: Date;
    updated_at: Date
  }