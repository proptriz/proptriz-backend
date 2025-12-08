import { Router } from "express";
import PropertyController from "../controllers/propertyController";
import { verifyToken } from "../middlewares/verifyToken";
import upload from "../utils/multer";
import { propertyValidations } from "../middlewares/validation";

const propertyRoutes = Router();

propertyRoutes.get("/all", PropertyController.getAllProperties);
propertyRoutes.get("/:pid", propertyValidations.getById, PropertyController.getPropertyById);
propertyRoutes.get("/nearest-prop/:pid", PropertyController.getNearestProperties);
propertyRoutes.get("/user/listed", verifyToken, PropertyController.getUserProperties);
propertyRoutes.post("/add", verifyToken, upload.array('images', 5), PropertyController.addProperty);
propertyRoutes.put("/update/:pid", verifyToken, PropertyController.updateProperty);
propertyRoutes.delete("/delete/:pid", verifyToken, PropertyController.deleteProperty);
propertyRoutes.post("/image/delete", verifyToken, PropertyController.deletePropertyImage);
propertyRoutes.put("/image/update", verifyToken, upload.single('image'), PropertyController.updatePropertyImage);

export default propertyRoutes;