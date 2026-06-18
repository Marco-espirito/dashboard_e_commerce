import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError } from "../middleware/errorHandler";
import { env } from "../lib/env";

const router = Router();

const REFRESH_COOKIE = "refreshToken";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 jours en ms
const IS_PROD = env.NODE_ENV === "production";

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "strict" : "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/api/auth",
  });
}

const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

// POST /api/auth/login
router.post("/login", asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0].message);
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(401, "Identifiants incorrects");
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new AppError(401, "Identifiants incorrects");
  }

  const payload = { userId: user.id, role: user.role };
  const accessToken = signToken(payload);
  const refreshToken = signRefreshToken(payload);

  setRefreshCookie(res, refreshToken);

  return res.json({
    token: accessToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}));

// POST /api/auth/refresh — émet un nouvel access token si le cookie refresh est valide
router.post("/refresh", (req, res) => {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE];

  if (!token) {
    return res.status(401).json({ error: "Refresh token manquant" });
  }

  try {
    const payload = verifyRefreshToken(token);
    const accessToken = signToken({ userId: payload.userId, role: payload.role });

    // On fait tourner le refresh token (rotation) pour limiter la fenêtre d'abus
    const newRefreshToken = signRefreshToken({ userId: payload.userId, role: payload.role });
    setRefreshCookie(res, newRefreshToken);

    return res.json({ token: accessToken });
  } catch {
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    return res.status(401).json({ error: "Session expirée, veuillez vous reconnecter" });
  }
});

// POST /api/auth/logout — efface le cookie côté serveur
router.post("/logout", (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  return res.json({ success: true });
});

// GET /api/auth/me — renvoie l'utilisateur courant
router.get("/me", authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  if (!user) {
    throw new AppError(404, "Utilisateur introuvable");
  }

  return res.json({ user });
}));

export default router;
