import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError } from "../middleware/errorHandler";
import { logAudit } from "../lib/audit";

const router = Router();

router.use(authenticate, requireAdmin);

/**
 * Règles de mot de passe :
 *  - 8 caractères minimum
 *  - Au moins une lettre majuscule
 *  - Au moins un chiffre
 *  - Au moins un caractère spécial
 */
const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre")
  .regex(
    /[!@#$%^&*()\-_=+\[\]{};':",.<>/?\\|`~]/,
    "Le mot de passe doit contenir au moins un caractère spécial"
  );

const createMemberSchema = z.object({
  name: z.string().min(2, "Le nom doit faire au moins 2 caractères"),
  email: z.string().email("Email invalide"),
  password: passwordSchema,
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

// GET /api/members
router.get("/", asyncHandler(async (_req, res) => {
  const members = await prisma.user.findMany({
    where: { deletedAt: null }, // exclure les membres supprimés (soft delete)
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, email: true, role: true, createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
  return res.json({ members });
}));

// POST /api/members
router.post("/", asyncHandler(async (req, res) => {
  const parsed = createMemberSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0].message);

  const { name, email, password, role } = parsed.data;

  // Ne bloquer que sur un compte actif. Les comptes supprimés ont leur email
  // anonymisé (voir DELETE), donc ne créent pas de conflit ici.
  const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (existing) throw new AppError(409, "Cet email est déjà utilisé");

  const hashed = await bcrypt.hash(password, 10);

  const member = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role,
      createdById: req.user!.userId,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  await logAudit({
    action: "CREATE",
    entity: "MEMBER",
    entityId: member.id,
    entityLabel: member.email,
    userId: req.user!.userId,
    metadata: { name: member.name, email: member.email, role: member.role },
  });

  return res.status(201).json({ member });
}));

// DELETE /api/members/:id
router.delete("/:id", asyncHandler(async (req, res) => {
  const id = req.params.id as string;

  if (id === req.user!.userId) {
    throw new AppError(400, "Vous ne pouvez pas vous supprimer vous-même");
  }

  const member = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!member) throw new AppError(404, "Membre introuvable");

  await logAudit({
    action: "DELETE",
    entity: "MEMBER",
    entityId: id,
    entityLabel: member.email,
    userId: req.user!.userId,
    metadata: { name: member.name, email: member.email, role: member.role },
  });

  // Soft delete : on conserve la ligne (références FK vers audit logs et
  // historique de statut intactes), on marque la date de suppression, et on
  // anonymise l'email pour libérer la contrainte d'unicité (réutilisable).
  // Les refresh tokens sont révoqués → déconnexion immédiate de tous ses appareils.
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        email: `deleted_${Date.now()}_${member.email}`,
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return res.json({ success: true });
}));

export default router;
