import { Router } from "express";
import UserController from "../controllers/userController";
import { verifyToken } from "../middlewares/verifyToken";

const userRoutes = Router();

userRoutes.post("/signup", UserController.signUp);
userRoutes.post("/login", UserController.login);
userRoutes.post("/authenticate", verifyToken, UserController.authenticate);
userRoutes.post("/auth/facebook", UserController.facebookAuth); // Placeholder
userRoutes.get("/get-user/:id", UserController.getUser);
userRoutes.post("/auth", UserController.authenticateUser);

export default userRoutes;