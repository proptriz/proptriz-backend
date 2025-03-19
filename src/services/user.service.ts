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
        provider: 'credentials'
      });

      await user.save();

      const newUser = {
        username: user.username,
        fullname: user.fullname,
        image: user.email,
        phone: user.phone
      }

      return { success: true, message: "User registered successfully", user: newUser };
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  // User login
  static async login(username: string, password: string, provider='credentials') {
    try {
      // Find user by username or email
      const user = await User.findOne({ $or: [{ username }, { email: username.toLowerCase() }] });
      if (!user) throw new Error("Invalid credentials");

      // Verify password
      if (provider==='credentials') {
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) throw new Error("Invalid credentials");
      }

      // Generate JWT token
      const token = generateUserToken(user);
      const authUser = {
        _id: user._id,
        username: user.username,
        fullname: user.fullname,
        image: user.email,
        phone: user.phone
      }

      return { success: true, token, user:authUser };
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  static async updateProfile(authUser:IUser, userData: IUser) {
    try {
      // update user profile
      const updatedUser = await User.findByIdAndUpdate(authUser._id, {
        phone: userData.phone,
        fillname: userData.fullname,
        image: userData.image
      }, { new:true }).select('-password').exec();
      
      if (!updatedUser) throw new Error("User does not exist");
      return { success: true, message: "Updated Profile successfully", user: updatedUser };
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  static async changePassword(authUser: IUser, newPassword: string) {
    try {
      // Hash password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Create user
      const user = await User.findByIdAndUpdate(authUser._id, {
        password: hashedPassword,
      }).select('-password');

      return { success: true, message: "Password reset successfully", user: user };
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  // Get User
static async getOauthUser(email: string) {
  try {
    // Find user by email, excluding the password field
    const user = await User.findOne({ $or: [{ username: email }, { email: email }] }).select('-password');
    if (!user) throw new Error(`No user with ${email}`);

    // Generate JWT token
    const token = generateUserToken(user);
    return { success: true, token, user };  
  } catch (error: any) {
    throw new Error(error.message);
  }
}


  // static async authenticate(body: any) {
  //   try {
  //     const { email, name, image, provider } = body;
  //     const user = await User.findOne({
  //       email: email,
  //     }).exec();
      
  //     if(user) {
  //       return user;
  //     } else {
  //       const newUser = await User.create({
  //         email: email,
  //         fullname: name || "",
  //         image: image || "", 
  //         provider: provider || ""
  //       })

  //       return newUser;
  //     }
  //   } catch (error: any) {
  //     throw new Error(error.message);
  //   }
  // }
}

export default UserService;
