import { Router } from "express";
import * as propertyController from "../controllers/propertyController";

const propertyRoutes = Router();

propertyRoutes.get("/all", propertyController.getAllProps);
propertyRoutes.get("/:pid", propertyController.getProp);
propertyRoutes.post("/add", propertyController.addProp);
propertyRoutes.put("/update/:pid", propertyController.updateProp);
propertyRoutes.delete("/delete/:pid", propertyController.deleteProp);

export default propertyRoutes;