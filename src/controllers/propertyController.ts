import { Request, Response } from "express";

export const getAllProps = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "Property list returned successfully"
    })
}

export const getProp = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "Single property returned successfully"
    })
}

export const addProp = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "Added property successfully"
    })
}

export const updateProp = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "Updated property successfully"
    })
}

export const deleteProp = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "Property deleted successfully"
    })
}