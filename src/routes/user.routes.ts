import { Router } from "express";
import UserController from "../controllers/userController";

const userRoutes = Router();

userRoutes.post("/signup", UserController.signUp);
userRoutes.post("/login", UserController.login);
userRoutes.post("/auth/facebook", UserController.facebookAuth); // Placeholder

export default userRoutes;