import { Document, Types } from "mongoose";


export interface IUser extends Document {
    username: string; // 
    password: string; // Foreing key referencing property under review
    fullname?: string; // User Legal Name (e.g. Tony Adeola Ezenwa)
    image?: string; // URL to user profile pics (optional)
    email?: string; // for notification    
    phone?: string; // URLs of reviewer upload (optional)
    provider?: string; // URLs of reviewer upload (optional)
    created_at: Date; // (auto)
};

export interface IProperty extends Document {
    banner: string; // URL of the property image or image with index = 0
    title: string; // Title of the property (e.g. 3 bedroom flat, self contain, )
    slug: string;
    address: string; // Location of the property
    price: number; // Price per month
    listed_for: string; // (e.g. "sell"/ "rent")
    category: string; // The class of property (e.g. house, land, shop, office, hotel )
    period?: string; // if is for rent, payment period (e.g monthly, yearly, daily)
    negotiable: boolean; // (true/false)
    property_terms?: string // agent terms and condit
    images: string[]; //Other property images for gallery
    agent: Types.ObjectId; //foreign key representing agent that list the property
    map_location?: {
      type: 'Point';
      coordinates: [number, number];
    };
    features?: [{
        name: string;
        quantity: number;
    }];
    env_falities?: string[];
    status: string; // (available, sold, unavailable, rented)
    created_at: Date;
    updated_at: Date;
  };

  export interface IAgent extends Document { 
    user: Types.ObjectId; //foreign key 
    brand_name: string; // User Legal Name (e.g. Tony Adeola Ezenwa)
    image: string; // URL to user profile pics (optional)
    fulfillment_terms: string;
    beacame_agent_date: Date; // (auto)
    modified_at: Date;
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
    review_date: Date; // (auto)
  };

  export interface IAgentReview extends Document {
    rating: number; // Rating score (0.0 to 5.0)
    comment?: string; // user review text (optional)
    review_giver: Types.ObjectId; // Foreing key referencing userId
    review_receiver: Types.ObjectId; // Foreing key referencing property under review
    images?: string[]; // URLs of reviewer upload (optional)
    review_date: Date; // (auto)
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