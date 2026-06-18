import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../lib/env";

const JWT_SECRET = env.JWT_SECRET;
const REFRESH_SECRET = env.REFRESH_SECRET || (JWT_SECRET + "_refresh");

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours en ms

export type UserRole = "ADMIN" | "MEMBER";

export interface JwtPayload {
  userId: string;
  role: UserRole;
  /** jti du refresh token associé — permet d'identifier la session courante. */
  sessionId?: string;
}

/** Payload d'un refresh token — inclut un identifiant unique (jti). */
export interface RefreshPayload extends JwtPayload {
  jti: string;
}

// ─── Access token ─────────────────────────────────────────────────────────────

/** Signe un access token de courte durée (15 min par défaut). */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]) || "15m",
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

// ─── Refresh token ────────────────────────────────────────────────────────────

/**
 * Signe un refresh token de longue durée (7 j).
 * Retourne le token JWT et son jti — le jti est stocké en DB
 * pour permettre la révocation côté serveur.
 */
export function signRefreshToken(payload: JwtPayload): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ ...payload, jti }, REFRESH_SECRET, { expiresIn: "7d" });
  return { token, jti };
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, REFRESH_SECRET) as RefreshPayload;
}
