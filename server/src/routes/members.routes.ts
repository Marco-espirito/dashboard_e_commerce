import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireAdmin } from "../middleware/auth";

const router = Router();

// 🔒 Toutes les routes ci-dessous nécessitent d'être connecté ET admin
router.use(authenticate, requireAdmin);

const createMemberSchema = z.object({
  name: z.string().min(2, "Le nom doit faire au moins 2 caractères"),
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

// GET /api/members → liste tous les utilisateurs
router.get("/", async (_req, res) => {
  const members = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
  return res.json({ members });
});

// POST /api/members → crée un nouveau membre
router.post("/", async (req, res) => {
  const parsed = createMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { name, email, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "Cet email est déjà utilisé" });
  }

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

  return res.status(201).json({ member });
});

// DELETE /api/members/:id → supprime un membre
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  // Sécurité : l'admin ne peut pas se supprimer lui-même
  if (id === req.user!.userId) {
    return res
      .status(400)
      .json({ error: "Vous ne pouvez pas vous supprimer vous-même" });
  }

  const member = await prisma.user.findUnique({ where: { id } });
  if (!member) {
    return res.status(404).json({ error: "Membre introuvable" });
  }

  await prisma.user.delete({ where: { id } });
  return res.json({ success: true });
});

export default router;
