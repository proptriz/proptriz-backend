import { Router } from "express";
import * as userController from "../controllers/userController";

const userRoutes = Router();

userRoutes.get("/auth", userController.authenticateUser);
userRoutes.post("/signup", userController.registerUser);
userRoutes.delete("/delete/:uid", userController.deleteUser);

export default userRoutes;