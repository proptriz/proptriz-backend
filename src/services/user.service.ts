import User from "../models/user";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { IUser } from "../types";
import dotenv from "dotenv";
import { generateUserToken } from "../helpers/jwt";

dotenv.config();

class UserService {
  // Sign up a new user
  static async signUp(username: string, password: string, fullname?: string, phone?: number, image?: string) {
    try {
      // Check if username is an email
      const email = username.includes("@") ? username.toLowerCase() : undefined;

      // Check if user already exists
      const existingUser = await User.exists({ username });
      if (existingUser) throw new Error("Username or email already exists");

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = new User({
        username,
        email,
        password: hashedPassword,
        fullname,
        phone,
        image,
      });

      await user.save();

      return { success: true, message: "User registered successfully", user: user };
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  // User login
  static async login(username: string, password: string) {
    try {
      // Find user by username or email
      const user = await User.findOne({ $or: [{ username }, { email: username.toLowerCase() }] });
      if (!user) throw new Error("Invalid credentials");

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) throw new Error("Invalid credentials");

      // Generate JWT token
      const token = generateUserToken(user);

      return { success: true, token, user };
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  // Facebook authentication (To be implemented)
  static async facebookAuth(fbToken: string) {
    try {
      // Placeholder for actual Facebook OAuth authentication logic
      return { success: false, message: "Facebook authentication not implemented yet" };
    } catch (error: any) {
      throw new Error(error.message);
    }
  }
}

export default UserService;
