import { Request, Response } from "express";
import AgentService from "../services/agent.service";
import { IAgent, IUser } from "../types";


export const getAllAgents = async (req: Request, res: Response) => {
  try {
    console.log("Fetching all agents with filters:", req.query);
    const filters = req.query;
    const agents = await AgentService.getAgents(filters);
    console.log("Agents fetched successfully:", agents);
    res.status(200).json( agents );
  } catch (error: any) {
    console.error("Error fetching all properties:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

// Get a agent by ID
export const getAgentById = async (req: Request, res: Response) => {
  try {
    console.log("Fetching agent with ID:", req.params.pid);
    const agentId = req.params.pid;
    const agent = await AgentService.getAgentById(agentId);
    console.log("Agent fetched successfully:", agent);
    res.status(200).json( agent );
  } catch (error: any) {
    console.error("Error fetching agent by ID:", error.message);
    res.status(404).json({ success: false, message: error.message });
  }
}

export const registerAgent = async (req:Request, res:Response) => {
  try {
    const currentUser = req.currentUser as IUser;
    const agentData = req.body;
    const result = await AgentService.registerAgent(currentUser, agentData)
    console.info(result)
    return res.status(200).json(result)
  } catch (error:any){
    console.error("Agent registrat error: ", error.message)
    return res.status(400).json({message: "Agent registration error"})
  }
}

export const updateProfile = async (req:Request, res:Response) => {
    try {
      const currentUser = req.authAgent as IAgent;
      const agentData = req.body;
      const result = await AgentService.updateAgent(currentUser, agentData)
      console.info(result)
      return res.status(200).json(result)
    } catch (error:any){
      console.error("Agent update error: ", error.message)
      return res.status(400).json({message: "Agent update error"})
    }
  }

export const deleteAgent = async (req:Request, res:Response) => {
  try {
    const authAgent = req.authAgent as IAgent;

    const result = await AgentService.deleteAgent(authAgent);
    return res.status(200).json(result)
  } catch (error:any){
    console.error("Agent deletion error: ", error.message)
    return res.status(500).json({message: "Agent deletion error"})
  }
}