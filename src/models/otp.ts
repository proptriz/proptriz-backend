import mongoose from "mongoose";

const UserOtpVerificationSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true
    },
    code: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 300,
    }
})

export const UserOtpVerification = mongoose.models.UserOtpVerification || mongoose.model('UserOtpVerification',UserOtpVerificationSchema)