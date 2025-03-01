import { Router } from "express";
import PropertyController from "../controllers/propertyController";

const propertyRoutes = Router();

propertyRoutes.get("/all", PropertyController.getAllProperties);
propertyRoutes.get("/:pid", PropertyController.getPropertyById);
propertyRoutes.post("/add", PropertyController.addProperty);
propertyRoutes.put("/update/:pid", PropertyController.updateProperty);
propertyRoutes.delete("/delete/:pid", PropertyController.deleteProperty)

export default propertyRoutes;