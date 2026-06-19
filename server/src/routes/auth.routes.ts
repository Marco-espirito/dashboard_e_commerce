import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  signToken,
  signRefreshToken,
  verifyRefreshToken,
  signTwoFactorChallenge,
  verifyTwoFactorChallenge,
  REFRESH_TOKEN_TTL_MS,
} from "../utils/jwt";
import { verifyTotp } from "../lib/totp";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError } from "../middleware/errorHandler";
import { requireCsrfHeader } from "../middleware/csrf";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { logAuthEvent, extractClientInfo } from "../lib/audit";

const router = Router();

const REFRESH_COOKIE = "refreshToken";
const IS_PROD = env.NODE_ENV === "production";

/** Nombre d'échecs consécutifs avant verrouillage du compte. */
const MAX_LOGIN_ATTEMPTS = 3;
/** Durée du verrouillage en ms (15 minutes). */
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "strict" : "lax",
    maxAge: REFRESH_TOKEN_TTL_MS,
    path: "/api/auth",
  });
}

const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post("/login", asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);

  const { email, password } = parsed.data;
  const clientInfo = extractClientInfo(req);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) {
    // Email inconnu ou compte supprimé — même message que "mauvais mot de passe"
    // pour éviter l'énumération d'emails via les messages d'erreur.
    await logAuthEvent({ type: "LOGIN_FAILED", email, ...clientInfo });
    throw new AppError(401, "Identifiants incorrects");
  }

  // ── Vérification du verrouillage ──────────────────────────────────────────
  const isLocked = user.lockedUntil && user.lockedUntil > new Date();
  if (isLocked) {
    const remainingMin = Math.ceil(
      (user.lockedUntil!.getTime() - Date.now()) / 60_000
    );
    await logAuthEvent({ type: "LOGIN_FAILED", email, userId: user.id, ...clientInfo });
    throw new AppError(
      429,
      `Compte temporairement bloqué. Réessayez dans ${remainingMin} minute${remainingMin > 1 ? "s" : ""}.`
    );
  }

  // ── Vérification du mot de passe ──────────────────────────────────────────
  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    // Si le verrou précédent a expiré, on repart de 0 pour le compteur.
    const baseAttempts = user.lockedUntil && user.lockedUntil <= new Date() ? 0 : user.loginAttempts;
    const newAttempts = baseAttempts + 1;
    const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: newAttempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCKOUT_DURATION_MS)
          : null,
      },
    });

    if (shouldLock) {
      await logAuthEvent({ type: "ACCOUNT_LOCKED", email, userId: user.id, ...clientInfo });
      throw new AppError(
        429,
        `Compte bloqué pendant 15 minutes après ${MAX_LOGIN_ATTEMPTS} tentatives échouées.`
      );
    }

    await logAuthEvent({ type: "LOGIN_FAILED", email, userId: user.id, ...clientInfo });
    const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;
    throw new AppError(
      401,
      remaining > 0
        ? `Identifiants incorrects. ${remaining} tentative${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""} avant blocage.`
        : "Identifiants incorrects."
    );
  }

  // ── Mot de passe correct — réinitialiser le compteur d'échecs ─────────────
  // (qu'il y ait 2FA ou non, l'étape mot de passe est validée)
  if (user.loginAttempts !== 0 || user.lockedUntil !== null) {
    await prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null },
    });
  }

  // ── Étape 2FA : si activée, on n'émet PAS encore les tokens ───────────────
  if (user.totpEnabled) {
    return res.json({
      twoFactorRequired: true,
      challengeToken: signTwoFactorChallenge(user.id),
    });
  }

  // ── Connexion réussie (sans 2FA) ──────────────────────────────────────────
  return completeLogin(req, res, user);
}));

/**
 * Émet les tokens de session pour un utilisateur authentifié (mot de passe +
 * éventuellement 2FA déjà validés). Partagé entre le login simple et la
 * vérification du code 2FA.
 */
async function completeLogin(
  req: Request,
  res: Response,
  user: { id: string; email: string; name: string; role: "ADMIN" | "MEMBER" }
) {
  const { token: refreshToken, jti } = signRefreshToken({ userId: user.id, role: user.role });
  // sessionId = jti du refresh token → permet d'identifier la session courante
  const accessToken = signToken({ userId: user.id, role: user.role, sessionId: jti });

  await prisma.refreshToken.create({
    data: {
      jti,
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress: (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim()
        ?? req.socket.remoteAddress
        ?? null,
    },
  });

  // Nettoyer les tokens expirés (best-effort, sans bloquer la réponse)
  prisma.refreshToken
    .deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } })
    .catch((err) => logger.warn({ err }, "Échec nettoyage refresh tokens expirés"));

  await logAuthEvent({
    type: "LOGIN_SUCCESS",
    email: user.email,
    userId: user.id,
    ...extractClientInfo(req),
  });

  setRefreshCookie(res, refreshToken);
  return res.json({
    token: accessToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}

// ── POST /api/auth/login/2fa ──────────────────────────────────────────────────
// Seconde étape du login : finalise la connexion après vérification du code TOTP.
const twoFactorLoginSchema = z.object({
  challengeToken: z.string().min(1, "Challenge manquant"),
  code: z.string().min(6, "Code à 6 chiffres requis"),
});

router.post("/login/2fa", asyncHandler(async (req, res) => {
  const parsed = twoFactorLoginSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);

  const { challengeToken, code } = parsed.data;
  const clientInfo = extractClientInfo(req);

  let userId: string;
  try {
    ({ userId } = verifyTwoFactorChallenge(challengeToken));
  } catch {
    throw new AppError(401, "Session de connexion expirée, veuillez recommencer.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt || !user.totpEnabled || !user.totpSecret) {
    throw new AppError(401, "Vérification impossible.");
  }

  if (!verifyTotp(code, user.totpSecret)) {
    await logAuthEvent({ type: "LOGIN_FAILED", email: user.email, userId: user.id, ...clientInfo });
    throw new AppError(401, "Code de vérification invalide.");
  }

  return completeLogin(req, res, user);
}));

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
router.post("/refresh", requireCsrfHeader, asyncHandler(async (req, res) => {
  const rawToken: string | undefined = req.cookies?.[REFRESH_COOKIE];

  if (!rawToken) {
    return res.status(401).json({ error: "Refresh token manquant" });
  }

  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    return res.status(401).json({ error: "Session expirée, veuillez vous reconnecter" });
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { jti: payload.jti },
  });

  if (!stored || stored.revokedAt !== null || stored.expiresAt < new Date()) {
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    return res.status(401).json({ error: "Session invalide, veuillez vous reconnecter" });
  }

  const { token: newRefreshToken, jti: newJti } = signRefreshToken({
    userId: payload.userId,
    role: payload.role,
  });
  const newAccessToken = signToken({
    userId: payload.userId,
    role: payload.role,
    sessionId: newJti,
  });

  const revoked = await prisma.refreshToken.updateMany({
    where: { jti: payload.jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (revoked.count === 0) {
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    return res.status(401).json({ error: "Session invalide, veuillez vous reconnecter" });
  }

  // Nouveau token : hérite du userAgent/IP de l'ancien, met à jour lastUsedAt
  await prisma.refreshToken.create({
    data: {
      jti: newJti,
      userId: payload.userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      lastUsedAt: new Date(),
      userAgent: stored.userAgent,
      ipAddress: stored.ipAddress,
    },
  });

  setRefreshCookie(res, newRefreshToken);
  return res.json({ token: newAccessToken });
}));

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post("/logout", requireCsrfHeader, asyncHandler(async (req, res) => {
  const rawToken: string | undefined = req.cookies?.[REFRESH_COOKIE];

  if (rawToken) {
    try {
      const payload = verifyRefreshToken(rawToken);
      await prisma.refreshToken.updateMany({
        where: { jti: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { email: true },
      });
      await logAuthEvent({
        type: "LOGOUT",
        email: user?.email ?? "",
        userId: payload.userId,
        ...extractClientInfo(req),
      });
    } catch {
      // Token invalide ou expiré — on efface le cookie quand même
    }
  }

  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  return res.json({ success: true });
}));

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/me", authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.user!.userId, deletedAt: null },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  if (!user) throw new AppError(404, "Utilisateur introuvable");
  return res.json({ user });
}));

export default router;
