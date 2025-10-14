import { Router } from "express";
import PropertyController from "../controllers/propertyController";
import { verifyToken } from "../middlewares/verifyToken";
import upload from "../utils/multer";

const propertyRoutes = Router();

propertyRoutes.get("/all", PropertyController.getAllProperties);
propertyRoutes.get("/:pid", PropertyController.getPropertyById);
propertyRoutes.post("/add", verifyToken, upload.array('images', 5), PropertyController.addProperty);
propertyRoutes.put("/update/:pid", PropertyController.updateProperty);
propertyRoutes.delete("/delete/:pid", PropertyController.deleteProperty);

export default propertyRoutes;