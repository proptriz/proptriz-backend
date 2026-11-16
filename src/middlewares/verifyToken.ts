import { NextFunction, Request, Response } from "express";
import { decodeUserToken } from "../helpers/jwt";
import { IUser } from "../types";
import { createHash, timingSafeEqual } from "crypto";
import logger from "../config/loggingConfig";

/** Constant-time string comparison (hashing first so lengths always match). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

declare module 'express-serve-static-core' {
  interface Request {
    currentUser?: IUser;
    token?: string;
  }
}

export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // First, checking if the token exists in the cookies
  const tokenFromCookie = req.cookies.token;

  // Fallback to the authorization header if token is not in the cookie
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader && authHeader.split(" ")[1];

  // Prioritize token from cookies, then from header
  const token = tokenFromCookie || tokenFromHeader;

  if (!token) {
    logger.warn("Authentication token is missing.");
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    // Decode the token to get the user information
    const currentUser = await decodeUserToken(token);

    if (!currentUser) {
      logger.warn("Authentication token is invalid or expired.");
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Attach currentUser to the request object
    req.currentUser = currentUser;
    req.token = token;
    next();
  } catch (error) {
    logger.error('Failed to verify token:', error);
    return res.status(500).json({ message: 'Failed to verify token; please try again later' });
  }
};

export const verifyAdminToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { ADMIN_API_USERNAME, ADMIN_API_PASSWORD } = process.env;

  const authHeader = req.headers.authorization;
  const base64Credentials = authHeader && authHeader.split(" ")[1];
  if (!base64Credentials) {
    logger.warn("Admin credentials are missing.");
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Refuse outright when the admin credentials are not configured, so an
  // empty username/password can never match.
  if (!ADMIN_API_USERNAME || !ADMIN_API_PASSWORD) {
    logger.error("Admin credentials are not configured.");
    return res.status(401).json({ message: "Unauthorized" });
  }

  const credentials = Buffer.from(base64Credentials, "base64").toString("utf8");
  const separator = credentials.indexOf(":");
  const username = separator === -1 ? credentials : credentials.slice(0, separator);
  const password = separator === -1 ? "" : credentials.slice(separator + 1);

  if (!safeEqual(username, ADMIN_API_USERNAME) || !safeEqual(password, ADMIN_API_PASSWORD)) {
    logger.warn("Admin credentials are invalid.");
    return res.status(401).json({ message: "Unauthorized" });
  }

  logger.info("Admin credentials verified successfully.");
  next();
};
