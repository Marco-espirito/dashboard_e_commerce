import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError } from "../middleware/errorHandler";
import {
  generateTotpSecret,
  buildOtpAuthUrl,
  buildQrCodeDataUrl,
  verifyTotp,
} from "../lib/totp";

const router = Router();

// Toutes les routes nécessitent un utilisateur authentifié.
router.use(authenticate);

const codeSchema = z.object({
  code: z.string().min(6, "Code à 6 chiffres requis").max(8),
});

// ─── GET /api/auth/2fa/status ─────────────────────────────────────────────────
router.get("/status", asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { totpEnabled: true },
  });
  if (!user) throw new AppError(404, "Utilisateur introuvable");
  return res.json({ enabled: user.totpEnabled });
}));

// ─── POST /api/auth/2fa/setup ─────────────────────────────────────────────────
// Génère un secret (non encore actif) et renvoie le QR code à scanner.
router.post("/setup", asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { email: true, totpEnabled: true },
  });
  if (!user) throw new AppError(404, "Utilisateur introuvable");
  if (user.totpEnabled) throw new AppError(409, "La 2FA est déjà activée.");

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { totpSecret: secret },
  });

  const otpauthUrl = buildOtpAuthUrl(user.email, secret);
  const qrCode = await buildQrCodeDataUrl(otpauthUrl);

  return res.json({ qrCode, otpauthUrl });
}));

// ─── POST /api/auth/2fa/enable ────────────────────────────────────────────────
// Confirme la configuration en vérifiant un premier code.
router.post("/enable", asyncHandler(async (req, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!user) throw new AppError(404, "Utilisateur introuvable");
  if (user.totpEnabled) throw new AppError(409, "La 2FA est déjà activée.");
  if (!user.totpSecret) throw new AppError(400, "Lancez d'abord la configuration (setup).");

  if (!verifyTotp(parsed.data.code, user.totpSecret)) {
    throw new AppError(400, "Code invalide. Vérifiez l'heure de votre téléphone.");
  }

  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { totpEnabled: true },
  });

  return res.json({ success: true });
}));

// ─── POST /api/auth/2fa/disable ───────────────────────────────────────────────
// Désactive la 2FA (exige un code valide pour prouver la possession).
router.post("/disable", asyncHandler(async (req, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!user) throw new AppError(404, "Utilisateur introuvable");
  if (!user.totpEnabled || !user.totpSecret) {
    throw new AppError(409, "La 2FA n'est pas activée.");
  }

  if (!verifyTotp(parsed.data.code, user.totpSecret)) {
    throw new AppError(400, "Code invalide.");
  }

  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { totpEnabled: false, totpSecret: null },
  });

  return res.json({ success: true });
}));

export default router;
