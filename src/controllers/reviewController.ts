import { Request, Response } from "express";

export const getUserReviews = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "A User Review list returned successfully"
    })
}

export const getSingleReview = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "A User Single Review returned successfully"
    })
}

export const addReview = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "Added review for a user successfully"
    })
}

export const deleteUserReview = (req:Request, res:Response) => {
    return res.status(200).json({
        message: "A User single review deleted successfully"
    })
}