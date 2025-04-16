import User from "../models/user";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { IUser } from "../types";
import dotenv from "dotenv";
import { generateFourDigitCode, generateUserToken } from "../helpers/jwt";
import { UserOtpVerification } from "../models/otp";
import { mailOptions } from "../config/mailOptions";
import { Transporter } from "../config/emailTransporter";

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
        email: user.email,
        fullname: user.fullname,
        image: user.image,
        phone: user.phone,
      }

      console.log(user)
      
      const userId = user._id && user._id.toString();
      console.log(userId)
      if(user) await handleOtpAuth(user.email)


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

      return { success: true, user: user}

      // Generate JWT token
      // const token = generateUserToken(user);
      // const authUser = {
      //   _id: user._id,
      //   username: user.username,
      //   fullname: user.fullname,
      //   image: user.image,
      //   email: user.email,
      //   phone: user.phone
      // }

      // return { success: true, token, user:authUser };

    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  static async authenticate(body: any) {
    try {
      const { email, name, image, provider } = body;
      const user = await User.findOne({ $or: [{ username: email }, { email: email }] }).exec();
      
      if(user) {
         // Generate JWT token
      const token = generateUserToken(user);
      const authUser = {
        _id: user._id,
        username: user.username,
        fullname: user.fullname,
        image: user.image,
        email: user.email,
        phone: user.phone
      }

      return { success: true, token, user:authUser };
        // return user;
      } else {
        const newUser = await User.create({
          email: email,
          fullname: name || "",
          image: image || "", 
          provider: provider || ""
        })

         // Generate JWT token
      const token = generateUserToken(newUser);
      const authUser = {
        _id: newUser._id,
        username: newUser.username,
        fullname: newUser.fullname,
        image: newUser.image,
        email: newUser.email,
        phone: newUser.phone
      }

      return { success: true, token, user:authUser };

        // return newUser;
      }
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
}

export const handleOtpAuth = async (email: any) => {

  const code = generateFourDigitCode();
  
  try {
    await Transporter.sendMail(mailOptions(email, code));
    const hashedOtp = await bcrypt.hash(code.toString(), 10);

    const verifyUserOtp = await UserOtpVerification.findOne({email: email});
    if (verifyUserOtp) {
      await UserOtpVerification.findOneAndUpdate(
        {email: email},
        { code: hashedOtp },
        { new: true }
      );
    } else {
      const userOtp = new UserOtpVerification({
        email: email,
        code: hashedOtp,
      });

      await userOtp.save();
    }
    // const userId = userId.toString();
    // return NextResponse.json({ message: "Email sent successfully", data: {user_id: userId} }, {status: 200})
  } catch (err: any) {
    console.log(err.message);
    throw new Error("An Error!!! occure sending email:" + err.message)
    // return NextResponse.json({ message: err.message }, {status: 400});
  }
}

export default UserService;
