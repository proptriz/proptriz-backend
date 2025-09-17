import Agent from "../models/agent";
import { IAgent, IUser } from "../types";
import { FilterQuery, UpdateQuery } from "mongoose";

class AgentService {
  // register a new agent
  async registerAgent(authUser:IUser, agentData: IAgent): Promise<{agent:IAgent, message: string}> {
    try {
      const agent = new Agent({
        ...agentData,
        user: authUser._id,
      });
      const newAgent = await agent.save();
      return {agent: newAgent, message: "Agent registration successfull"}
    } catch (error: any) {
      throw new Error(`Agent registration failed: ${error.message}`);
    }
  }

  // Get a single agent by its ID
  async getAgentById(agentId:string): Promise<IAgent | null> {
    try {
      return await Agent.findById(agentId).populate("agent").exec();
    } catch (error: any) {
      throw new Error(`Failed to retrieve agent with ID ${agentId}: ${error.message}`);
    }
  }

  // Get a list of agents based on a filter
  async getAgents(filter: FilterQuery<IAgent> = {}): Promise<IAgent[]> {
    try {
      return await Agent.find(filter).populate("user").exec();
    } catch (error: any) {
      throw new Error(`Failed to retrieve agents: ${error.message}`);
    }
  }

  // Update a agent by its ID
  async updateAgent(authAgent: IAgent, updateData: UpdateQuery<IAgent>): Promise<{agent:IAgent, message: string} | null> {
    try {
      const updatedAgent = await Agent.findByIdAndUpdate(
        authAgent._id,
        { ...updateData },
        { new: true, runValidators: true }
      ).exec();

      if (!updatedAgent) {
        throw new Error(`Agent with ID ${authAgent._id} not found`);
      }

      return {agent: updatedAgent, message: "Agent record updated successufully"};
    } catch (error: any) {
      throw new Error(`Failed to update agent with ID ${authAgent._id}: ${error.message}`);
    }
  }

  // Delete a agent by its ID
  async deleteAgent(authAgent: IAgent): Promise<{success:boolean, message:string}> {
    try {
      const result = await Agent.findByIdAndDelete(authAgent._id).exec();

      if (!result) {
        throw new Error(`Agent with ID ${authAgent._id} not found`);
      }
      return {success: true, message: "Agent deleted successfully"};
    } catch (error: any) {
      throw new Error(`Failed to delete agent with ID ${authAgent._id}: ${error.message}`);
    }
  }
}

export default new AgentService();
