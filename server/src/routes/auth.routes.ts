import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken } from "../utils/jwt";
import { authenticate } from "../middleware/auth";

const router = Router();

const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

// POST /api/auth/login → renvoie un token + les infos publiques de l'utilisateur
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "Identifiants incorrects" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Identifiants incorrects" });
  }

  const token = signToken({ userId: user.id, role: user.role });

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

// GET /api/auth/me → renvoie l'utilisateur courant (pratique pour le frontend)
router.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  if (!user) {
    return res.status(404).json({ error: "Utilisateur introuvable" });
  }

  return res.json({ user });
});

export default router;
