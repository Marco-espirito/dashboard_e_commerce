import jwt from "jsonwebtoken";
import { env } from "../lib/env";

const JWT_SECRET = env.JWT_SECRET;
const REFRESH_SECRET = env.REFRESH_SECRET || (JWT_SECRET + "_refresh");

export type UserRole = "ADMIN" | "MEMBER";

export interface JwtPayload {
  userId: string;
  role: UserRole;
}

/** Access token — courte durée (15 min) */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]) || "15m",
  });
}

/** Refresh token — longue durée (7 j), stocké en cookie httpOnly */
export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtPayload;
}
