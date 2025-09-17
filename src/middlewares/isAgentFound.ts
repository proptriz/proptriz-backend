import { NextFunction, Request, Response } from "express";
import { IAgent, IUser } from "../types";
import Agent from "../models/agent";
import { error } from "console";


declare module 'express-serve-static-core' {
  interface Request {
    authAgent?: IAgent;
  }
}

export const isAgentFound = async (
  req: Request,
  res: Response,
  next: NextFunction
)=>{
  const authUser = req.currentUser as IUser;

  try {
    const authAgent = await Agent.findById(authUser._id);
    if (!authAgent) {
      console.warn("Agent is missing.");
      return res.status(404).json({ success:false, message: "Agent not found" });
    }
    req.authAgent = authAgent;
    next();
  }catch (error:any){
    console.error('Failed to verify agent:', error);
    return res.status(500).json({ success:false, message: 'Failed to verify agent' });
  }
  
}