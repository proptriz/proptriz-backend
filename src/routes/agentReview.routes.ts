import { Router } from "express";
import * as AgentReviewContoller from "../controllers/agentReviewController" ;
import { verifyToken } from "../middlewares/verifyToken";
import { isAgentFound } from "../middlewares/isAgentFound";

const agentReviewRoutes = Router();

agentReviewRoutes.post("/add", verifyToken, isAgentFound, AgentReviewContoller.addReview);
agentReviewRoutes.get("/:id", AgentReviewContoller.getSingleAgentReview); // to get individual agent profile
agentReviewRoutes.get("/all", AgentReviewContoller.getAgentAllReviews);

export default agentReviewRoutes;