// import { NextFunction, Request, Response } from "express";
// import { decodeUserToken, generateUserToken } from "../helpers/jwt";
// import { IUser } from "../types";
// import User from "../models/user";

// declare module 'express-serve-static-core' {
//   interface Request {
//     currentUser?: IUser;
//     token?: string;
//   }
// }

// export const verifyPassword = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   const isValidEmail = (email: string): boolean => {
//     const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
//     return regex.test(email);
//   };

//   // First, checking if the token exists in the cookies
//   const username = req.body.username;
//   const password = req.body.pawssord;

//   const user = await User.findOne({ username: username })

//   if (user) {
//     console.warn("User Already exist.");
//     return res.status(401).json({ message: "Signup failed, username already exist." });
//   }

//   try {
//     // Decode the token to get the user information
//     isValidEmail(username)? req.body.email;

//     if (!currentUser) {
//       console.warn("Authentication token is invalid or expired.");
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     // Attach currentUser to the request object
//     req.currentUser = currentUser;
//     req.token = token;
//     next();
//   } catch (error) {
//     console.error('Failed to verify token:', error);
//     return res.status(500).json({ message: 'Failed to verify token; please try again later' });
//   }
// };

// export const verifyAdminToken = (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   const { ADMIN_API_USERNAME, ADMIN_API_PASSWORD } = process.env;

//   const authHeader = req.headers.authorization;
//   const base64Credentials = authHeader && authHeader.split(" ")[1];
//   if (!base64Credentials) {
//     console.warn("Admin credentials are missing.");
//     return res.status(401).json({ message: "Unauthorized" });
//   }

//   const credentials = Buffer.from(base64Credentials, "base64").toString("ascii");
//   const [username, password] = credentials.split(":");

//   if (username !== ADMIN_API_USERNAME || password !== ADMIN_API_PASSWORD) {
//     console.warn("Admin credentials are invalid.");
//     return res.status(401).json({ message: "Unauthorized" });
//   }

//   console.info("Admin credentials verified successfully.");
//   next();
// };
