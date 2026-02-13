import { Request, Response } from "express";
import * as UserService from "../services/user.service";
import * as jwtHelper from "../helpers/jwt";
import googleClient from "../config/googleClient";
import { IUser } from "../types";
import logger from "../config/loggingConfig";
import { env } from "../utils/env";
import { AuthProvider } from "../models/enums/AuthProvider";
import { LeanWithId } from "../helpers/leanWithId";
import { UserType } from "../models/user";


export const authenticatePiUser = async (req: Request, res: Response) => {
  try {
    const piUser = req.body.user;

    const provider = AuthProvider.pi;
    const providerUserId = piUser.pi_uid;
    const profile = {
      name: piUser.username,
      username: piUser.username,
    }

    const { user, requiresOnboarding } = await UserService.resolveUser(provider, providerUserId, profile);

    if (!user) throw new Error("Error finding or creating a user")

    const token = jwtHelper.generateUserToken(user);
    const expiresDate = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000); // 1 day

    logger.info(`User authenticated: ${user._id}`);

    return res.cookie("token", token, {httpOnly: true, expires: expiresDate, secure: true, priority: "high", sameSite: "lax"}).status(200).json({
      user: user,
      token,
      requiresOnboarding
    });

  } catch (error: any) {
    logger.error('Failed to authenticate user:', error);
    return res.status(500).json({ message: error.message || 'An error occurred while authenticating user; please try again later' });
  }
};

export const autoLoginUser = async(req: Request, res: Response) => {
  try {
    const currentUser = req.currentUser as LeanWithId<UserType>;
    logger.info(`Auto-login successful for user: ${currentUser?._id || "NULL"}`);
    return res.status(200).json({
      user: currentUser,
    });
  } catch (error) {
    logger.error(`Failed to auto-login user for userID ${ req.currentUser?._id }:`, error);
    return res.status(500).json({ message: 'An error occurred while auto-logging the user; please try again later' });
  }
};

// export const getUser = async(req: Request, res: Response) => {
//   const { pi_uid } = req.params;
//   try {
//     const currentUser: IUser | null = await UserService.getUser(pi_uid);
//     if (!currentUser) {
//       logger.warn(`User not found with PI_UID: ${pi_uid}`);
//       return res.status(404).json({ message: "User not found" });
//     }
//     logger.info(`Fetched user with PI_UID: ${pi_uid}`);
//     return res.status(200).json(currentUser);
//   } catch (error) {
//     logger.error(`Failed to fetch user for userID ${ pi_uid }:`, error);
//     return res.status(500).json({ message: 'An error occurred while getting user; please try again later' });
//   }
// };

// export const deleteUser = async (req: Request, res: Response) => {
//   const currentUser = req.currentUser;
//   try {
//     const deletedData = await UserService.deleteUser(currentUser?.pi_uid);
//     logger.info(`Deleted user with PI_UID: ${currentUser?.pi_uid}`);
//     return res.status(200).json({ message: "User deleted successfully", deletedData });
//   } catch (error) {
//     logger.error(`Failed to delete user for userID ${ currentUser?.pi_uid }:`, error);
//     return res.status(500).json({ message: 'An error occurred while deleting user; please try again later' });
//   }
// };

export const authenticateGoogleUser = async (req: Request, res: Response) => {
  try {
    const idToken = req.body.idToken;
    logger.info("Authenticating Google user with provided ID token.", {idToken});

    if (!idToken) {
      return res.status(400).json({ message: "Missing idToken" });
    }

    // Verify token signature + claims
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID, // important!
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({ message: "Invalid Google token" });
    }

    if (!payload.email || !payload.email_verified) {
      return res.status(401).json({ message: "Email not verified" });
    }

    const { user, requiresOnboarding } = await UserService.resolveUser(
      AuthProvider.google,
      payload.sub,
      {
        email: payload.email,
        email_verified: payload.email_verified,
        name: payload.name,
        picture: payload.picture,
      }
    );

    if (!user) throw new Error("Error finding or creating a user")

    const token = jwtHelper.generateUserToken(user);
    const expiresDate = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000); // 1 day

    logger.info(`User authenticated: ${user._id}`);

    return res.cookie("token", token, {httpOnly: true, expires: expiresDate, secure: true, priority: "high", sameSite: "lax"}).status(200).json({
      user: user,
      token,
      requiresOnboarding
    });

  } catch (err) {
    logger.error("Google auth error:", err);
    return res.status(401).json({ message: "Google token verification failed" });
  }
};
