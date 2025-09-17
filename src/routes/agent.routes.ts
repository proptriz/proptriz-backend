import { Router } from "express";
import * as AgentController from "../controllers/agentController" ;
import { verifyToken } from "../middlewares/verifyToken";
import { isAgentFound } from "../middlewares/isAgentFound";

const agentRoutes = Router();

agentRoutes.post("/register", verifyToken, AgentController.registerAgent);
agentRoutes.get("/:id", AgentController.getAgentById); // to get individual agent profile
agentRoutes.get("/dashboard", verifyToken, isAgentFound, AgentController.getAgentById); //agent dashboard data
agentRoutes.get("/all", AgentController.getAllAgents);
agentRoutes.put("/update-profile", verifyToken, isAgentFound, AgentController.updateProfile);
agentRoutes.delete("/", verifyToken, isAgentFound, AgentController.deleteAgent);

export default agentRoutes;