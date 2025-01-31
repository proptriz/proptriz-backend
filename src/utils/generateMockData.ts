import mongoose from "mongoose";
import Property from "../models/property"; // Adjust this path based on your project structure
import { ListingType } from "../models/enums/listingType";
import { Category } from "../models/enums/Category";
import { PaymentPeriod } from "../models/enums/paymentPeriod";
import { PropertyStatus } from "../models/enums/propertyStatus";
import { faker } from "@faker-js/faker";
import { env } from "./env";

// Major cities in Nigeria with approximate coordinates
const cities = [
  { name: "Lagos", coordinates: [6.5244, 3.3792] },
  { name: "Abuja", coordinates: [9.0579, 7.4951] },
  { name: "Port Harcourt", coordinates: [4.8242, 7.0336] },
  { name: "Kano", coordinates: [12.0022, 8.5919] },
  { name: "Ibadan", coordinates: [7.3775, 3.9470] },
  { name: "Enugu", coordinates: [6.5249, 7.5170] },
  { name: "Jos", coordinates: [9.8965, 8.8583] },
  { name: "Kaduna", coordinates: [10.5105, 7.4165] },
  { name: "Benin City", coordinates: [6.3382, 5.6258] },
  { name: "Abeokuta", coordinates: [7.1475, 3.3619] },
];

// Generate mock properties
const generateMockProperties = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(env.MONGODB_URL, {});

    console.log("Connected to the database.");

    const mockProperties = [];

    for (let i = 0; i < 50; i++) {
      const randomCity = cities[Math.floor(Math.random() * cities.length)];
      const randomFeatures = Array.from({ length: 3 }, () => ({
        name: faker.commerce.productName(),
        quantity: faker.number.int({ min: 1, max: 5 }),
      }));

      const property = {
        banner: faker.image.url({ width: 640, height: 480 }),
        title: faker.commerce.productName(),
        slug: faker.helpers.slugify(faker.commerce.productName()),
        address: `${faker.address.streetAddress()}, ${randomCity.name}`,
        price: faker.number.int({ min: 50000, max: 10000000 }),
        listed_for: faker.helpers.arrayElement(Object.values(ListingType)),
        category: faker.helpers.arrayElement(Object.values(Category)),
        period: faker.helpers.arrayElement(Object.values(PaymentPeriod)),
        negotiable: faker.datatype.boolean(),
        images: Array.from({ length: 3 }, () => faker.image.url({ width: 640, height: 480})),
        agent: new mongoose.Types.ObjectId(), // Replace with a valid agent ID from your database
        map_location: {
          type: "Point",
          coordinates: randomCity.coordinates,
        },
        features: randomFeatures,
        env_falities: Array.from({ length: 2 }, () => faker.lorem.word()),
        status: faker.helpers.arrayElement(Object.values(PropertyStatus)),
        created_at: faker.date.past(),
        updated_at: faker.date.recent(),
      };

      mockProperties.push(property);
    }

    // Insert mock properties into the database
    await Property.insertMany(mockProperties);
    console.log("Mock properties inserted successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Error generating mock properties:", error);
    process.exit(1);
  }
};

generateMockProperties();
