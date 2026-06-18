import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// Toutes les routes nécessitent une authentification (admin ET membre)
router.use(authenticate);

// ─── GET /api/auth/sessions ───────────────────────────────────────────────────
// Retourne toutes les sessions actives de l'utilisateur courant.
// La session en cours est identifiée via req.user.sessionId (= jti dans l'access token).
router.get("/", asyncHandler(async (req, res) => {
  const sessions = await prisma.refreshToken.findMany({
    where: {
      userId: req.user!.userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      jti: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      userAgent: true,
      ipAddress: true,
    },
  });

  return res.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      isCurrent: s.jti === req.user!.sessionId,
    })),
  });
}));

// ─── DELETE /api/auth/sessions/:id ───────────────────────────────────────────
// Révoque une session spécifique (l'utilisateur ne peut révoquer que ses propres sessions).
router.delete("/:id", asyncHandler(async (req, res) => {
  const id = req.params.id as string;

  const session = await prisma.refreshToken.findUnique({ where: { id } });

  if (!session) throw new AppError(404, "Session introuvable");
  if (session.userId !== req.user!.userId) throw new AppError(403, "Accès refusé");
  if (session.revokedAt) throw new AppError(409, "Session déjà révoquée");

  await prisma.refreshToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  return res.json({ success: true });
}));

// ─── DELETE /api/auth/sessions ────────────────────────────────────────────────
// Révoque toutes les sessions sauf la session courante ("déconnecter partout ailleurs").
router.delete("/", asyncHandler(async (req, res) => {
  const currentJti = req.user!.sessionId;

  const { count } = await prisma.refreshToken.updateMany({
    where: {
      userId: req.user!.userId,
      revokedAt: null,
      // Exclure la session courante si elle est connue
      ...(currentJti ? { jti: { not: currentJti } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  return res.json({ success: true, revokedCount: count });
}));

export default router;
