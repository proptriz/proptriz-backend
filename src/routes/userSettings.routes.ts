import { Router } from "express";
import { UserSettingsController } from "../controllers/userSettingsController";
import { verifyToken } from "../middlewares/verifyToken";
import upload from "../utils/multer";
import { userSettingsValidations } from "../middlewares/validation";

const settingsRoutes = Router();
const settingsController = new UserSettingsController()

settingsRoutes.get("/", verifyToken, settingsController.getSettings);
settingsRoutes.post(
  "/add",
  verifyToken,
  upload.single('image'),
  userSettingsValidations.update, 
  settingsController.addOrUpdateSettings
);

export default settingsRoutes;