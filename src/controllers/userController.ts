import { Request, Response } from "express";
import UserService from "../services/user.service";
import { IUser } from "../types";

const UserController = {
  // User Signup
  async signUp(req: Request, res: Response) {
    try {
      console.log("Signup request received:", req.body);
      const { username, password, fullname, phone, image } = req.body;
      const result = await UserService.signUp(username, password, fullname, phone, image);
      console.log("User signed up successfully:", result);
      res.status(201).json(result);
    } catch (error: any) {
      console.error("Signup error:", error.message);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // User Login
  async login(req: Request, res: Response) {
    try {
      console.log("Login request received:", req.body);
      const { username, password } = req.body;
      const result = await UserService.login(username, password);
      console.log("User logged in successfully:", result);
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Login error:", error.message);
      res.status(401).json({ success: false, message: error.message }); 
    }
  },

  // verify is user is login
  async authenticate(req: Request, res: Response) {
    try {
      const authUser = req.currentUser;
      console.log("User authentication successfully:", authUser);
      res.status(200).json(authUser);
    } catch (error: any) {
      console.error("user authentication error:", error.message);
      res.status(401).json({ success: false, message: error.message });
    }
  },

  async changePassword(req: Request, res: Response) {
    try {
      const authUser = req.currentUser as IUser;
      const newPassword = req.body.newPassword;
      console.log("User authentication successfully:", authUser);
      const result = await UserService.changePassword(authUser, newPassword)
      res.status(200).json(result);
    } catch (error: any) {
      console.error("user authentication error:", error.message);
      res.status(401).json({ success: false, message: error.message });
    }
  },

};

export default UserController;
