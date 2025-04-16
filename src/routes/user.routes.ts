import { Router } from "express";
import UserController from "../controllers/userController";
import { verifyToken } from "../middlewares/verifyToken";

const userRoutes = Router();

userRoutes.post("/signup", UserController.signUp);
userRoutes.post("/login", UserController.login);
userRoutes.post("/verify-otp", UserController.otpVerification);
userRoutes.post("/resend-otp", UserController.resendOtp);
userRoutes.post("/authenticate", UserController.authenticate);
userRoutes.put("/update-profile", verifyToken, UserController.updateProfile);
userRoutes.put("/change-password", verifyToken, UserController.changePassword);
userRoutes.get("/get-user/:email", UserController.getOathUser);
// userRoutes.post("/auth", UserController.authenticateUser);

export default userRoutes;