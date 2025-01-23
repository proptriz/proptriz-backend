import { Router } from "express";

const homeRoutes = Router();

homeRoutes.get("/", (req, res) => {
    res.status(200).json({
        message:"E Landlord Server is running on port 8002"
    })
})

export default homeRoutes
