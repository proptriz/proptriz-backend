import { NextFunction, Request, Response } from "express";
import { IAgent, IUser } from "../types";
import Agent from "../models/agent";

export const isAgentFound = async (
  req: Request,
  res: Response,
  next: NextFunction
)=>{
  try {
    const authUser = req.currentUser as IUser;
    const recieverId = req.body as string;
    const receiverAgent = await Agent.findById(recieverId);
    if (authUser._id===receiverAgent?.user._id ) {
      console.warn("Agent can not review self.");
      return res.status(404).json({ success:false, message: "Agent can not review self" });
    }
    next();
  }catch (error:any){
    console.error('error in self review:', error);
    return res.status(500).json({ success:false, message: 'add review failed' });
  }
  
}