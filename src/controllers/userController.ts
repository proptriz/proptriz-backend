import { Request, Response } from "express";

export const authenticateUser = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "User login successfully"
    })
}

export const registerUser = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "User registered successfully"
    })
}

export const deleteUser = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "User deleted successfully"
    })
}