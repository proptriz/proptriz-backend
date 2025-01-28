import { Request, Response } from "express";

export const getAllAgents = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "Agent list returned successfully"
    })
}

export const getAgent = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "Single agent returned successfully"
    })
}

export const authenticateAgent = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "Agent authenticated successfully"
    })
}

export const registerAgent = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "Agent registered successfully"
    })
}

export const deleteAgent = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "Agent deleted successfully"
    })
}