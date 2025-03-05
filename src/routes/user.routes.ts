import { Router } from "express";
import UserController from "../controllers/userController";
import { verifyToken } from "../middlewares/verifyToken";

const userRoutes = Router();

userRoutes.post("/signup", UserController.signUp);
userRoutes.post("/login", UserController.login);
userRoutes.post("/authenticate", verifyToken, UserController.authenticate);
userRoutes.put("/change-password", verifyToken, UserController.changePassword);

export default userRoutes;